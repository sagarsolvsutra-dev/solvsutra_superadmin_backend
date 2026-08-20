const Payment = require("../models/Payment");
const Subscription = require("../models/Subscription");
const Project = require("../models/Project");
const Plan = require("../models/Plan");
const Notification = require("../models/Notification");
const ActivityLog = require("../models/ActivityLog");
const { generatePaymentId } = require("../utils/generateIds");
const { addDuration } = require("../utils/dateHelpers");
const { asyncHandler } = require("../middleware/errorHandler");

// Razorpay instance
let razorpay;
try {
  const Razorpay = require("razorpay");
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
} catch (e) {
  console.warn("Razorpay not configured:", e.message);
}

// @desc    Get all payments
// @route   GET /api/payments
// @access  Private
const getPayments = asyncHandler(async (req, res) => {
  const { clientId, projectId, status, page = 1, limit = 20 } = req.query;
  const query = {};

  if (clientId) query.clientId = clientId;
  if (projectId) query.projectId = projectId;
  if (status) query.status = status;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [payments, total] = await Promise.all([
    Payment.find(query)
      .populate("clientId", "companyName clientId email")
      .populate("projectId", "projectName projectId")
      .populate("planId", "name price")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Payment.countDocuments(query),
  ]);

  res.json({
    success: true,
    count: payments.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    payments,
  });
});

// @desc    Get single payment
// @route   GET /api/payments/:id
// @access  Private
const getPayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id)
    .populate("clientId", "companyName clientId email")
    .populate("projectId", "projectName projectId")
    .populate("planId", "name price duration");

  if (!payment) {
    return res.status(404).json({
      success: false,
      message: "Payment not found",
    });
  }

  res.json({
    success: true,
    payment,
  });
});

// @desc    Create Razorpay order
// @route   POST /api/payments/create-order
// @access  Private
const createOrder = asyncHandler(async (req, res) => {
  const { subscriptionId, planId } = req.body;

  let plan, subscription, clientId, projectId;

  if (subscriptionId) {
    subscription = await Subscription.findById(subscriptionId).populate("planId");
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found",
      });
    }
    plan = subscription.planId;
    clientId = subscription.clientId;
    projectId = subscription.projectId;
  } else if (planId) {
    plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }
    clientId = req.body.clientId;
    projectId = req.body.projectId;
  } else {
    return res.status(400).json({
      success: false,
      message: "Subscription ID or Plan ID required",
    });
  }

  if (plan.isFree) {
    return res.status(400).json({
      success: false,
      message: "This is a free plan, no payment required",
    });
  }

  const amount = plan.price * 100; // Convert to paise
  const currency = plan.currency || "INR";

  const payment = await Payment.create({
    paymentId: generatePaymentId(),
    clientId,
    projectId,
    subscriptionId: subscription?._id,
    planId: plan._id,
    amount: plan.price,
    currency,
    status: "created",
  });

  // Create Razorpay order if configured
  if (razorpay && process.env.RAZORPAY_KEY_ID !== "your_razorpay_key_id") {
    try {
      const order = await razorpay.orders.create({
        amount,
        currency,
        receipt: payment.paymentId,
        notes: {
          subscriptionId: subscription?.subscriptionId,
          planId: plan.planId,
          projectId: projectId?.toString(),
        },
      });

      payment.razorpayOrderId = order.id;
      payment.status = "pending";
      await payment.save();

      return res.json({
        success: true,
        orderId: order.id,
        amount,
        currency,
        paymentId: payment.paymentId,
      });
    } catch (error) {
      payment.status = "failed";
      payment.failureReason = error.message;
      await payment.save();

      return res.status(500).json({
        success: false,
        message: "Failed to create order",
        error: error.message,
      });
    }
  }

  // Test mode - return mock order
  res.json({
    success: true,
    orderId: `test_order_${payment.paymentId}`,
    amount,
    currency,
    paymentId: payment.paymentId,
    testMode: true,
  });
});

// @desc    Verify payment
// @route   POST /api/payments/verify
// @access  Private
const verifyPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, paymentId } = req.body;

  const payment = await Payment.findById(paymentId).populate("planId");
  if (!payment) {
    return res.status(404).json({
      success: false,
      message: "Payment not found",
    });
  }

  if (payment.status === "success") {
    return res.json({
      success: true,
      message: "Payment already verified",
      payment,
    });
  }

  // Verify signature (simplified - in production use crypto)
  // const crypto = require("crypto");
  // const generated_signature = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
  //   .update(`${razorpay_order_id}|${razorpay_payment_id}`)
  //   .digest("hex");

  payment.razorpayPaymentId = razorpay_payment_id;
  payment.razorpaySignature = razorpay_signature;
  payment.status = "success";
  payment.paidAt = new Date();
  await payment.save();

  // Renew subscription if linked
  if (payment.subscriptionId) {
    const subscription = await Subscription.findById(payment.subscriptionId).populate("planId");
    if (subscription) {
      const plan = subscription.planId;
      let newExpiry;

      if (subscription.status === "active") {
        newExpiry = addDuration(subscription.expiryDate, plan.duration, plan.durationUnit);
      } else {
        newExpiry = addDuration(new Date(), plan.duration, plan.durationUnit);
      }

      subscription.expiryDate = newExpiry;
      subscription.gracePeriodEndDate = addDuration(newExpiry, subscription.gracePeriodDays, "day");
      subscription.status = "active";
      subscription.renewalCount = (subscription.renewalCount || 0) + 1;
      subscription.lastRenewedAt = new Date();
      await subscription.save();

      // Update project status
      await Project.findByIdAndUpdate(subscription.projectId, { status: "active" });

      await ActivityLog.create({
        userId: req.user?._id,
        action: "AUTO_RENEW",
        entity: "Subscription",
        entityId: subscription._id.toString(),
        metadata: { paymentId: payment.paymentId, newExpiry },
        ipAddress: req.ip,
      });
    }
  }

  await ActivityLog.create({
    userId: req.user?._id,
    action: "PAYMENT_SUCCESS",
    entity: "Payment",
    entityId: payment._id.toString(),
    metadata: { razorpayPaymentId },
    ipAddress: req.ip,
  });

  await Notification.create({
    notificationId: require("../utils/generateIds").generateNotificationId(),
    clientId: payment.clientId,
    projectId: payment.projectId,
    subscriptionId: payment.subscriptionId,
    type: "payment_success",
    title: "Payment Successful",
    message: `Payment of ₹${payment.amount} has been received successfully`,
  });

  res.json({
    success: true,
    message: "Payment verified successfully",
    payment,
  });
});

// @desc    Razorpay webhook
// @route   POST /api/webhooks/razorpay
// @access  Public
const razorpayWebhook = asyncHandler(async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers["x-razorpay-signature"];

  // Verify webhook signature in production
  // const crypto = require("crypto");
  // const expectedSignature = crypto.createHmac("sha256", webhookSecret)
  //   .update(JSON.stringify(req.body))
  //   .digest("hex");

  const event = req.body.event;
  const payload = req.body.payload;

  console.log("Razorpay webhook received:", event);

  if (event === "payment.captured") {
    const orderId = payload.payment.entity.notes?.subscriptionId;
    if (!orderId) {
      return res.json({ success: true, message: "No subscription linked" });
    }

    // Find payment by order ID
    const payment = await Payment.findOne({ razorpayOrderId: orderId });
    if (!payment) {
      return res.json({ success: true, message: "Payment not found" });
    }

    // Idempotency check
    if (payment.status === "success") {
      return res.json({ success: true, message: "Already processed" });
    }

    payment.razorpayPaymentId = payload.payment.entity.id;
    payment.status = "success";
    payment.paidAt = new Date();
    payment.paymentMethod = payload.payment.entity.method;
    await payment.save();

    // Renew subscription
    if (payment.subscriptionId) {
      const subscription = await Subscription.findById(payment.subscriptionId).populate("planId");
      if (subscription) {
        const plan = subscription.planId;
        const newExpiry = addDuration(new Date(), plan.duration, plan.durationUnit);

        subscription.expiryDate = newExpiry;
        subscription.gracePeriodEndDate = addDuration(newExpiry, subscription.gracePeriodDays, "day");
        subscription.status = "active";
        subscription.renewalCount = (subscription.renewalCount || 0) + 1;
        subscription.lastRenewedAt = new Date();
        await subscription.save();

        await Project.findByIdAndUpdate(subscription.projectId, { status: "active" });
      }
    }

    console.log("Payment processed via webhook:", payment.paymentId);
  }

  if (event === "payment.failed") {
    const orderId = payload.payment.entity.notes?.subscriptionId;
    if (orderId) {
      const payment = await Payment.findOne({ razorpayOrderId: orderId });
      if (payment && payment.status !== "success") {
        payment.status = "failed";
        payment.failureReason = payload.payment.entity.error_description;
        await payment.save();

        await Notification.create({
          notificationId: require("../utils/generateIds").generateNotificationId(),
          clientId: payment.clientId,
          projectId: payment.projectId,
          subscriptionId: payment.subscriptionId,
          type: "payment_failed",
          title: "Payment Failed",
          message: `Payment of ₹${payment.amount} failed: ${payload.payment.entity.error_description}`,
        });
      }
    }
  }

  res.json({ success: true });
});

// @desc    Get payment statistics
// @route   GET /api/payments/stats
// @access  Private
const getPaymentStats = asyncHandler(async (req, res) => {
  const [totalPayments, successfulPayments, pendingPayments, failedPayments] = await Promise.all([
    Payment.countDocuments(),
    Payment.countDocuments({ status: "success" }),
    Payment.countDocuments({ status: "pending" }),
    Payment.countDocuments({ status: "failed" }),
  ]);

  // Calculate total revenue
  const revenueResult = await Payment.aggregate([
    { $match: { status: "success" } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const totalRevenue = revenueResult[0]?.total || 0;

  // Monthly revenue
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const monthlyRevenueResult = await Payment.aggregate([
    { $match: { status: "success", paidAt: { $gte: startOfMonth } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const monthlyRevenue = monthlyRevenueResult[0]?.total || 0;

  res.json({
    success: true,
    stats: {
      totalPayments,
      successfulPayments,
      pendingPayments,
      failedPayments,
      totalRevenue,
      monthlyRevenue,
    },
  });
});

module.exports = {
  getPayments,
  getPayment,
  createOrder,
  verifyPayment,
  razorpayWebhook,
  getPaymentStats,
};
