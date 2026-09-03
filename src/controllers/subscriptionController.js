const Subscription = require("../models/Subscription");
const Project = require("../models/Project");
const Client = require("../models/Client");
const Plan = require("../models/Plan");
const Notification = require("../models/Notification");
const ActivityLog = require("../models/ActivityLog");
const Payment = require("../models/Payment");
const { generateSubscriptionId } = require("../utils/generateIds");
const { addDuration, getDaysRemaining } = require("../utils/dateHelpers");
const { asyncHandler } = require("../middleware/errorHandler");

// @desc    Get all subscriptions
// @route   GET /api/subscriptions
// @access  Private
const getSubscriptions = asyncHandler(async (req, res) => {
  const { clientId, projectId, status, page = 1, limit = 20 } = req.query;
  const query = {};

  if (clientId) query.clientId = clientId;
  if (projectId) query.projectId = projectId;
  if (status) query.status = status;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [subscriptions, total] = await Promise.all([
    Subscription.find(query)
      .populate("clientId", "companyName clientId email")
      .populate("projectId", "projectName projectId")
      .populate("planId", "name price duration durationUnit")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Subscription.countDocuments(query),
  ]);

  res.json({
    success: true,
    count: subscriptions.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    subscriptions,
  });
});

// @desc    Get single subscription
// @route   GET /api/subscriptions/:id
// @access  Private
const getSubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findById(req.params.id)
    .populate("clientId", "companyName clientId email phone")
    .populate("projectId", "projectName projectId frontendUrl adminUrl")
    .populate("planId", "name description price duration durationUnit features");

  if (!subscription) {
    return res.status(404).json({
      success: false,
      message: "Subscription not found",
    });
  }

  res.json({
    success: true,
    subscription,
    daysRemaining: subscription.getDaysRemaining(),
  });
});

// @desc    Get subscription by project ID
// @route   GET /api/subscriptions/project/:projectId
// @access  Public (with API key)
const getSubscriptionByProject = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ projectId: req.params.projectId });

  if (!project) {
    return res.status(404).json({
      success: false,
      message: "Project not found",
    });
  }

  const subscription = await Subscription.findOne({ projectId: project._id })
    .populate("planId", "name description price duration durationUnit features isFree");

  if (!subscription) {
    return res.status(404).json({
      success: false,
      message: "No subscription found for this project",
    });
  }

  const daysRemaining = getDaysRemaining(subscription.expiryDate);

  res.json({
    success: true,
    projectId: project.projectId,
    status: subscription.status,
    plan: subscription.planId,
    startDate: subscription.startDate,
    expiryDate: subscription.expiryDate,
    daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
    gracePeriodEndDate: subscription.gracePeriodEndDate,
    autoRenew: subscription.autoRenew,
  });
});

// @desc    Create subscription
// @route   POST /api/subscriptions
// @access  Private
const createSubscription = asyncHandler(async (req, res) => {
  const { clientId, projectId, planId, startDate, gracePeriodDays, autoRenew, notes } = req.body;

  // Verify client and project exist
  const client = await Client.findById(clientId);
  const project = await Project.findById(projectId);
  const plan = await Plan.findById(planId);

  if (!client || !project || !plan) {
    return res.status(400).json({
      success: false,
      message: "Invalid client, project or plan",
    });
  }

  // `?? 7`, not `|| 7` — 0 is a valid, explicit choice from the Create form
  // and must not be silently replaced with a default grace period.
  const resolvedGraceDays = gracePeriodDays ?? 7;
  const start = new Date(startDate || Date.now());
  const expiry = addDuration(start, plan.duration, plan.durationUnit);
  const gracePeriodEndDate = addDuration(expiry, resolvedGraceDays, "day");

  const subscription = await Subscription.create({
    subscriptionId: generateSubscriptionId(),
    clientId,
    projectId,
    planId,
    startDate: start,
    expiryDate: expiry,
    gracePeriodDays: resolvedGraceDays,
    gracePeriodEndDate,
    autoRenew: autoRenew || false,
    status: "active",
    notes,
  });

  // Update project status
  project.status = "active";
  await project.save();

  await ActivityLog.create({
    userId: req.user._id,
    action: "CREATE",
    entity: "Subscription",
    entityId: subscription._id.toString(),
    metadata: { subscriptionId: subscription.subscriptionId, clientId, projectId, planId },
    ipAddress: req.ip,
  });

  // Create notification
  await Notification.create({
    notificationId: require("../utils/generateIds").generateNotificationId(),
    clientId,
    projectId,
    subscriptionId: subscription._id,
    type: "subscription_created",
    title: "New Subscription Created",
    message: `Subscription for ${project.projectName} has been created with plan ${plan.name}`,
  });

  res.status(201).json({
    success: true,
    subscription,
  });
});

// @desc    Update subscription
// @route   PUT /api/subscriptions/:id
// @access  Private
const updateSubscription = asyncHandler(async (req, res) => {
  const { clientId, projectId, planId, startDate, gracePeriodDays, autoRenew, status, notes } = req.body;

  const subscription = await Subscription.findById(req.params.id);

  if (!subscription) {
    return res.status(404).json({
      success: false,
      message: "Subscription not found",
    });
  }

  if (clientId) subscription.clientId = clientId;
  if (projectId) subscription.projectId = projectId;

  // Re-derive expiryDate/gracePeriodEndDate whenever anything that feeds
  // that math changes — same formula createSubscription uses — so this form
  // can't drift out of sync with the dates it implies.
  const planChanged = planId && planId !== subscription.planId.toString();
  const startChanged = startDate !== undefined && startDate !== "";
  const graceChanged = gracePeriodDays !== undefined;

  if (planChanged) subscription.planId = planId;
  if (startChanged) subscription.startDate = new Date(startDate);
  if (graceChanged) subscription.gracePeriodDays = gracePeriodDays;

  if (planChanged || startChanged || graceChanged) {
    const plan = await Plan.findById(subscription.planId);
    if (!plan) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan",
      });
    }
    subscription.expiryDate = addDuration(subscription.startDate, plan.duration, plan.durationUnit);
    // `?? 7`, not `|| 7` — an explicit 0-day grace period is a real, valid
    // choice here (this form just set `gracePeriodDays` to it above), and
    // `0 || 7` would silently discard that 0 and grant a phantom 7-day grace
    // that contradicts the `gracePeriodDays` value shown right next to it.
    subscription.gracePeriodEndDate = addDuration(subscription.expiryDate, subscription.gracePeriodDays ?? 7, "day");
  }

  if (autoRenew !== undefined) subscription.autoRenew = autoRenew;
  if (status) subscription.status = status;
  if (notes !== undefined) subscription.notes = notes;

  await subscription.save();

  await ActivityLog.create({
    userId: req.user._id,
    action: "UPDATE",
    entity: "Subscription",
    entityId: subscription._id.toString(),
    metadata: { status },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    subscription,
  });
});

// @desc    Renew subscription
// @route   POST /api/subscriptions/:id/renew
// @access  Private
const renewSubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findById(req.params.id).populate("planId");

  if (!subscription) {
    return res.status(404).json({
      success: false,
      message: "Subscription not found",
    });
  }

  const plan = subscription.planId;
  let newExpiry;

  if (subscription.status === "active" || subscription.status === "expiring") {
    // Extend from current expiry
    newExpiry = addDuration(subscription.expiryDate, plan.duration, plan.durationUnit);
  } else {
    // Start fresh from today
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
    userId: req.user._id,
    action: "RENEW",
    entity: "Subscription",
    entityId: subscription._id.toString(),
    metadata: { newExpiry, renewalCount: subscription.renewalCount },
    ipAddress: req.ip,
  });

  // Create notification
  await Notification.create({
    notificationId: require("../utils/generateIds").generateNotificationId(),
    clientId: subscription.clientId,
    projectId: subscription.projectId,
    subscriptionId: subscription._id,
    type: "subscription_renewed",
    title: "Subscription Renewed",
    message: `Subscription has been renewed until ${newExpiry.toLocaleDateString()}`,
  });

  res.json({
    success: true,
    subscription,
  });
});

// @desc    Suspend subscription
// @route   POST /api/subscriptions/:id/suspend
// @access  Private
const suspendSubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findById(req.params.id);

  if (!subscription) {
    return res.status(404).json({
      success: false,
      message: "Subscription not found",
    });
  }

  subscription.status = "suspended";
  await subscription.save();

  // Update project status
  await Project.findByIdAndUpdate(subscription.projectId, { status: "suspended" });

  await ActivityLog.create({
    userId: req.user._id,
    action: "SUSPEND",
    entity: "Subscription",
    entityId: subscription._id.toString(),
    metadata: { reason: req.body.reason },
    ipAddress: req.ip,
  });

  await Notification.create({
    notificationId: require("../utils/generateIds").generateNotificationId(),
    clientId: subscription.clientId,
    projectId: subscription.projectId,
    subscriptionId: subscription._id,
    type: "subscription_suspended",
    title: "Subscription Suspended",
    message: "Your subscription has been suspended. Please contact support.",
  });

  res.json({
    success: true,
    subscription,
  });
});

// @desc    Delete subscription
// @route   DELETE /api/subscriptions/:id
// @access  Private (super_admin)
const deleteSubscription = asyncHandler(async (req, res) => {
  const subscription = await Subscription.findById(req.params.id);

  if (!subscription) {
    return res.status(404).json({
      success: false,
      message: "Subscription not found",
    });
  }

  await subscription.deleteOne();

  await ActivityLog.create({
    userId: req.user._id,
    action: "DELETE",
    entity: "Subscription",
    entityId: subscription._id.toString(),
    metadata: { subscriptionId: subscription.subscriptionId },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: "Subscription deleted successfully",
  });
});

// @desc    Get subscription statistics
// @route   GET /api/subscriptions/stats
// @access  Private
const getSubscriptionStats = asyncHandler(async (req, res) => {
  const [total, active, expiring, expired, gracePeriod, suspended] = await Promise.all([
    Subscription.countDocuments(),
    Subscription.countDocuments({ status: "active" }),
    Subscription.countDocuments({ status: "expiring" }),
    Subscription.countDocuments({ status: "expired" }),
    Subscription.countDocuments({ status: "grace_period" }),
    Subscription.countDocuments({ status: "suspended" }),
  ]);

  // Calculate expiring (within 30 days)
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const expiringCount = await Subscription.countDocuments({
    status: "active",
    expiryDate: { $lte: thirtyDaysFromNow, $gt: new Date() },
  });

  res.json({
    success: true,
    stats: {
      total,
      active,
      expiring: expiringCount,
      expired,
      gracePeriod,
      suspended,
    },
  });
});

module.exports = {
  getSubscriptions,
  getSubscription,
  getSubscriptionByProject,
  createSubscription,
  updateSubscription,
  deleteSubscription,
  renewSubscription,
  suspendSubscription,
  getSubscriptionStats,
};
