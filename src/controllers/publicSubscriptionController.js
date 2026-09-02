const Subscription = require("../models/Subscription");
const Payment = require("../models/Payment");
const Plan = require("../models/Plan");
const Project = require("../models/Project");
const Notification = require("../models/Notification");
const { generatePaymentId, generateSubscriptionId } = require("../utils/generateIds");
const { addDuration } = require("../utils/dateHelpers");
const { asyncHandler } = require("../middleware/errorHandler");
const crypto = require("crypto");

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

// ============================================
// PUBLIC API - Authenticated via X-Api-Key
// Used by Shyam Enterprise (and other client apps)
// ============================================

const authenticateProject = asyncHandler(async (req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  const projectId = req.headers["x-project-id"];

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      message: "API key missing. Please configure your SolvSutra project credentials.",
    });
  }

  const query = { apiKey };
  if (projectId) {
    const idClauses = [{ projectId }];
    if (/^[0-9a-fA-F]{24}$/.test(projectId)) idClauses.push({ _id: projectId });
    query.$or = idClauses;
  }

  const project = await Project.findOne(query).populate("clientId");

  if (!project) {
    return res.status(401).json({
      success: false,
      message: "Invalid API key",
    });
  }

  // Deliberately no `project.status` gate here. Whether this project may
  // read or write is a subscription question, not a project one — that
  // nuance (active / grace period / locked) is resolveAccess()'s job, and
  // reads (plus the renewal endpoints themselves) must keep working even
  // while suspended, or a locked-out client could never pay their way back
  // in. `Project.status` is also not reliably accurate here: the expiry
  // cron sets it to "active" on expiry and "suspended" past grace period
  // (see expiryCron.js), so gating auth on it would trust a value this same
  // system doesn't even keep consistent.
  req.projectAuth = project;
  req.clientAuth = project.clientId;
  next();
});

// GET /api/subscription/public/my - Get current subscription
const getMySubscription = asyncHandler(async (req, res) => {
  // NOTE: 'expired', 'suspended' and 'cancelled' are included on purpose.
  // Excluding them made an expired project look identical to one that was
  // never configured, so the client app could not tell it should lock itself.
  const subscription = await Subscription.findOne({
    projectId: req.projectAuth._id,
    status: {
      $in: [
        "active",
        "expiring",
        "grace_period",
        "pending",
        "expired",
        "suspended",
        "cancelled",
      ],
    },
  })
    .sort({ createdAt: -1 })
    .populate("planId")
    .populate("projectId", "projectName projectId frontendUrl adminUrl backendUrl apiKey");

  if (!subscription) {
    return res.json({
      success: true,
      subscription: null,
      message: "No active subscription found",
    });
  }

  const now = new Date();
  const daysRemaining = Math.ceil((subscription.expiryDate - now) / (1000 * 60 * 60 * 24));
  const gracePeriodDaysRemaining = subscription.gracePeriodEndDate
    ? Math.ceil((subscription.gracePeriodEndDate - now) / (1000 * 60 * 60 * 24))
    : null;

  res.json({
    success: true,
    subscription: {
      _id: subscription._id,
      subscriptionId: subscription.subscriptionId,
      plan: subscription.planId,
      project: {
        projectName: subscription.projectId.projectName,
        projectId: subscription.projectId.projectId,
        apiKey: subscription.projectId.apiKey,
      },
      startDate: subscription.startDate,
      expiryDate: subscription.expiryDate,
      gracePeriodEndDate: subscription.gracePeriodEndDate,
      gracePeriodDays: subscription.gracePeriodDays,
      autoRenew: subscription.autoRenew,
      status: subscription.status,
      renewalCount: subscription.renewalCount,
      lastRenewedAt: subscription.lastRenewedAt,
      daysRemaining,
      gracePeriodDaysRemaining,
      isExpired: daysRemaining < 0,
      isExpiringSoon: daysRemaining >= 0 && daysRemaining <= 30,
      // Same source of truth the /access endpoint and the write-lock use.
      ...resolveAccess(subscription),
    },
  });
});

/**
 * Decide whether a project may still WRITE data, given its subscription.
 *
 * Policy (agreed with the client): the grace period is still working time —
 * the app keeps functioning and only warns. Access is withdrawn once the
 * grace period itself has elapsed, or if the subscription is suspended or
 * cancelled outright.
 *
 * Shared by getMySubscription and the dedicated /access endpoint so the
 * banner and the lock can never disagree.
 */
const resolveAccess = (subscription) => {
  if (!subscription) {
    // No subscription record at all — don't lock the app; this is almost
    // always a project that hasn't been onboarded yet.
    return {
      allowed: true,
      accessStatus: "unknown",
      reason: "No subscription found for this project",
    };
  }

  const now = new Date();
  const expiry = subscription.expiryDate ? new Date(subscription.expiryDate) : null;
  // Fall back to the expiry date when no grace end was stored.
  const graceEnd = subscription.gracePeriodEndDate
    ? new Date(subscription.gracePeriodEndDate)
    : expiry;

  if (subscription.status === "suspended") {
    return { allowed: false, accessStatus: "suspended", reason: "Subscription suspended" };
  }
  if (subscription.status === "cancelled") {
    return { allowed: false, accessStatus: "cancelled", reason: "Subscription cancelled" };
  }

  if (expiry && now > expiry) {
    if (graceEnd && now <= graceEnd) {
      return {
        allowed: true,
        accessStatus: "grace_period",
        reason: "Expired but still inside the grace period",
      };
    }
    return {
      allowed: false,
      accessStatus: "expired",
      reason: "Subscription expired and grace period is over",
    };
  }

  return { allowed: true, accessStatus: "active", reason: "Subscription active" };
};

/**
 * GET /api/subscription/public/access
 *
 * Deliberately tiny: a client app's backend calls this on a short cache to
 * decide whether to accept writes, so it must stay cheap and never throw.
 */
const getAccessStatus = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findOne({
    projectId: req.projectAuth._id,
  })
    .sort({ createdAt: -1 })
    .populate("planId", "name price");

  const access = resolveAccess(subscription);
  const now = new Date();

  res.json({
    success: true,
    ...access,
    projectName: req.projectAuth.projectName,
    projectStatus: req.projectAuth.status,
    planName: subscription?.planId?.name || null,
    status: subscription?.status || null,
    expiryDate: subscription?.expiryDate || null,
    gracePeriodEndDate: subscription?.gracePeriodEndDate || null,
    daysRemaining: subscription?.expiryDate
      ? Math.ceil((new Date(subscription.expiryDate) - now) / (1000 * 60 * 60 * 24))
      : null,
    checkedAt: now,
  });
});

// GET /api/subscription/public/plans
const getAvailablePlans = asyncHandler(async (req, res) => {
  const plans = await Plan.find({ status: "active" }).sort({ sortOrder: 1, price: 1 });
  res.json({
    success: true,
    plans,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder",
  });
});

// POST /api/subscription/public/renew/create-order
const createRenewalOrder = asyncHandler(async (req, res) => {
  const { subscriptionId, planId } = req.body;

  let plan, subscription;

  // Priority: planId (user wants to SWITCH to this plan) over subscriptionId (current plan)
  if (planId) {
    plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Plan not found",
      });
    }

    // Get the current subscription to extend/update
    if (subscriptionId) {
      subscription = await Subscription.findOne({
        _id: subscriptionId,
        projectId: req.projectAuth._id,
      });
    } else {
      subscription = await Subscription.findOne({
        projectId: req.projectAuth._id,
      }).sort({ createdAt: -1 });
    }
  } else if (subscriptionId) {
    // Only subscriptionId provided - renew current plan
    subscription = await Subscription.findOne({
      _id: subscriptionId,
      projectId: req.projectAuth._id,
    }).populate("planId");

    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found",
      });
    }
    plan = subscription.planId;
  } else {
    return res.status(400).json({
      success: false,
      message: "subscriptionId or planId required",
    });
  }

  if (plan.isFree) {
    return res.status(400).json({
      success: false,
      message: "This is a free plan, no payment required",
    });
  }

  const amount = plan.price * 100;
  const currency = plan.currency || "INR";

  const payment = await Payment.create({
    paymentId: generatePaymentId(),
    clientId: req.clientAuth._id,
    projectId: req.projectAuth._id,
    subscriptionId: subscription?._id,
    planId: plan._id,
    amount: plan.price,
    currency,
    status: "created",
    paymentType: "renewal",
  });

  if (razorpay && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID !== "your_razorpay_key_id") {
    try {
      const order = await razorpay.orders.create({
        amount,
        currency,
        receipt: payment.paymentId,
        notes: {
          paymentId: payment.paymentId,
          subscriptionId: subscription?.subscriptionId || "",
          projectId: req.projectAuth.projectId,
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
        razorpayKeyId: process.env.RAZORPAY_KEY_ID,
        subscriptionId: subscription?._id,
        plan: {
          name: plan.name,
          price: plan.price,
        },
      });
    } catch (error) {
      payment.status = "failed";
      payment.failureReason = error.message;
      await payment.save();

      return res.status(500).json({
        success: false,
        message: "Failed to create payment order",
        error: error.message,
      });
    }
  }

  // Test mode
  res.json({
    success: true,
    orderId: `test_order_${payment.paymentId}`,
    amount,
    currency,
    paymentId: payment.paymentId,
    razorpayKeyId: "rzp_test_placeholder",
    subscriptionId: subscription?._id,
    plan: {
      name: plan.name,
      price: plan.price,
    },
    testMode: true,
  });
});

// POST /api/subscription/public/renew/verify
const verifyRenewalPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, paymentId } = req.body;

  const payment = await Payment.findOne({
    paymentId,
    projectId: req.projectAuth._id,
  }).populate("planId");

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
    });
  }

  // Verify signature if real Razorpay
  if (
    razorpay &&
    process.env.RAZORPAY_KEY_SECRET &&
    razorpay_signature &&
    !razorpay_order_id.startsWith("test_order_")
  ) {
    try {
      const generatedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      if (generatedSignature !== razorpay_signature) {
        payment.status = "failed";
        payment.failureReason = "Invalid signature";
        await payment.save();
        return res.status(400).json({
          success: false,
          message: "Invalid payment signature",
        });
      }
    } catch (e) {
      console.error("Signature verification failed:", e.message);
    }
  }

  payment.razorpayPaymentId = razorpay_payment_id;
  payment.razorpaySignature = razorpay_signature;
  payment.status = "success";
  payment.paidAt = new Date();
  await payment.save();

  let subscription;
  if (payment.subscriptionId) {
    subscription = await Subscription.findById(payment.subscriptionId).populate("planId");
  }

  if (!subscription) {
    const plan = payment.planId;
    const startDate = new Date();
    const expiryDate = addDuration(startDate, plan.duration, plan.durationUnit);

    subscription = await Subscription.create({
      subscriptionId: generateSubscriptionId(),
      clientId: payment.clientId,
      projectId: payment.projectId,
      planId: plan._id,
      startDate,
      expiryDate,
      gracePeriodDays: 7,
      gracePeriodEndDate: addDuration(expiryDate, 7, "day"),
      status: "active",
      renewalCount: 1,
      lastRenewedAt: new Date(),
      notes: "Created via public renewal",
    });
  } else {
    // Use the paid plan (from payment record) - supports plan switching
    const plan = payment.planId;
    let newExpiry;

    // Check if user is switching to a different plan
    const isPlanSwitch = subscription.planId.toString() !== plan._id.toString();

    if (!isPlanSwitch && (subscription.status === "active" || subscription.status === "expiring")) {
      // Same plan + active = extend from current expiry
      newExpiry = addDuration(subscription.expiryDate, plan.duration, plan.durationUnit);
    } else {
      // Plan switch OR expired = start from today
      newExpiry = addDuration(new Date(), plan.duration, plan.durationUnit);
    }

    // Update plan if switched
    if (isPlanSwitch) {
      subscription.planId = plan._id;
    }

    subscription.expiryDate = newExpiry;
    subscription.gracePeriodEndDate = addDuration(newExpiry, subscription.gracePeriodDays, "day");
    subscription.status = "active";
    subscription.renewalCount = (subscription.renewalCount || 0) + 1;
    subscription.lastRenewedAt = new Date();
    await subscription.save();

    await Project.findByIdAndUpdate(subscription.projectId, { status: "active" });
  }

  await Notification.create({
    notificationId: require("../utils/generateIds").generateNotificationId(),
    clientId: payment.clientId,
    projectId: payment.projectId,
    subscriptionId: subscription._id,
    type: "payment_success",
    title: "Payment Successful - Subscription Renewed!",
    message: `Your payment of ₹${payment.amount} was successful. Your ${payment.planId.name} plan is now active until ${subscription.expiryDate.toDateString()}.`,
  });

  res.json({
    success: true,
    message: "Payment successful! Your subscription has been renewed.",
    subscription: {
      subscriptionId: subscription.subscriptionId,
      startDate: subscription.startDate,
      expiryDate: subscription.expiryDate,
      status: subscription.status,
      renewalCount: subscription.renewalCount,
      daysRemaining: Math.ceil((subscription.expiryDate - new Date()) / (1000 * 60 * 60 * 24)),
    },
    payment: {
      paymentId: payment.paymentId,
      amount: payment.amount,
      paidAt: payment.paidAt,
    },
  });
});

// GET /api/subscription/public/payments
const getMyPayments = asyncHandler(async (req, res) => {
  const payments = await Payment.find({ projectId: req.projectAuth._id })
    .populate("planId", "name price")
    .populate("subscriptionId", "subscriptionId startDate expiryDate")
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    payments,
  });
});

// GET /api/subscription/public/notifications
const getMyNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({
    projectId: req.projectAuth._id,
  })
    .sort({ createdAt: -1 })
    .limit(50);

  res.json({
    success: true,
    notifications,
  });
});

module.exports = {
  authenticateProject,
  getMySubscription,
  getAccessStatus,
  resolveAccess,
  getAvailablePlans,
  createRenewalOrder,
  verifyRenewalPayment,
  getMyPayments,
  getMyNotifications,
};