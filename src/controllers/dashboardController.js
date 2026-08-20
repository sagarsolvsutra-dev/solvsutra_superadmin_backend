const Client = require("../models/Client");
const Project = require("../models/Project");
const Subscription = require("../models/Subscription");
const Payment = require("../models/Payment");
const Notification = require("../models/Notification");
const { asyncHandler } = require("../middleware/errorHandler");
const { getDaysRemaining } = require("../utils/dateHelpers");

// @desc    Get dashboard statistics
// @route   GET /api/dashboard
// @access  Private
const getDashboardStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const [
    clientStats,
    projectStats,
    subscriptionStats,
    paymentStats,
  ] = await Promise.all([
    // Client stats
    Promise.all([
      Client.countDocuments(),
      Client.countDocuments({ status: "active" }),
      Client.countDocuments({ status: "inactive" }),
      Client.countDocuments({ status: "suspended" }),
    ]),
    // Project stats
    Promise.all([
      Project.countDocuments(),
      Project.countDocuments({ status: "active" }),
      Project.countDocuments({ status: "inactive" }),
      Project.countDocuments({ status: "suspended" }),
    ]),
    // Subscription stats
    Promise.all([
      Subscription.countDocuments(),
      Subscription.countDocuments({ status: "active" }),
      Subscription.countDocuments({ status: "expiring" }),
      Subscription.countDocuments({ status: "expired" }),
      Subscription.countDocuments({ status: "grace_period" }),
      Subscription.countDocuments({ status: "suspended" }),
      Subscription.countDocuments({
        status: "active",
        expiryDate: { $lte: thirtyDaysFromNow, $gt: now },
      }),
    ]),
    // Payment stats
    Promise.all([
      Payment.countDocuments(),
      Payment.countDocuments({ status: "success" }),
      Payment.countDocuments({ status: "pending" }),
      Payment.countDocuments({ status: "failed" }),
    ]),
  ]);

  // Revenue calculation
  const revenueResult = await Payment.aggregate([
    { $match: { status: "success" } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  // Monthly revenue
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const monthlyRevenueResult = await Payment.aggregate([
    { $match: { status: "success", paidAt: { $gte: startOfMonth } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  res.json({
    success: true,
    stats: {
      clients: {
        total: clientStats[0],
        active: clientStats[1],
        inactive: clientStats[2],
        suspended: clientStats[3],
      },
      projects: {
        total: projectStats[0],
        active: projectStats[1],
        inactive: projectStats[2],
        suspended: projectStats[3],
      },
      subscriptions: {
        total: subscriptionStats[0],
        active: subscriptionStats[1],
        expiring: subscriptionStats[6],
        expired: subscriptionStats[3],
        gracePeriod: subscriptionStats[4],
        suspended: subscriptionStats[5],
      },
      payments: {
        total: paymentStats[0],
        successful: paymentStats[1],
        pending: paymentStats[2],
        failed: paymentStats[3],
      },
      revenue: {
        total: revenueResult[0]?.total || 0,
        monthly: monthlyRevenueResult[0]?.total || 0,
      },
    },
  });
});

// @desc    Get dashboard widgets data
// @route   GET /api/dashboard/widgets
// @access  Private
const getDashboardWidgets = asyncHandler(async (req, res) => {
  const now = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [
    recentClients,
    recentPayments,
    expiringProjects,
    failedPayments,
    unreadNotifications,
  ] = await Promise.all([
    // Recent clients
    Client.find().sort({ createdAt: -1 }).limit(5).select("companyName clientId email status createdAt"),

    // Recent successful payments
    Payment.find({ status: "success" })
      .sort({ paidAt: -1 })
      .limit(5)
      .populate("clientId", "companyName")
      .populate("projectId", "projectName")
      .select("amount paidAt clientId projectId"),

    // Expiring subscriptions (within 30 days)
    Subscription.find({
      status: "active",
      expiryDate: { $lte: thirtyDaysFromNow, $gt: now },
    })
      .sort({ expiryDate: 1 })
      .limit(5)
      .populate("clientId", "companyName")
      .populate("projectId", "projectName")
      .populate("planId", "name"),

    // Recent failed payments
    Payment.find({ status: "failed" })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("clientId", "companyName")
      .populate("projectId", "projectName")
      .select("amount failureReason clientId projectId"),

    // Unread notifications
    Notification.find({ isRead: false })
      .sort({ createdAt: -1 })
      .limit(10)
      .select("title message type createdAt"),
  ]);

  // Add days remaining to expiring projects
  const expiringWithDays = expiringProjects.map((sub) => ({
    ...sub.toObject(),
    daysRemaining: getDaysRemaining(sub.expiryDate),
  }));

  res.json({
    success: true,
    widgets: {
      recentClients,
      recentPayments,
      expiringProjects: expiringWithDays,
      failedPayments,
      notifications: unreadNotifications,
    },
  });
});

module.exports = {
  getDashboardStats,
  getDashboardWidgets,
};
