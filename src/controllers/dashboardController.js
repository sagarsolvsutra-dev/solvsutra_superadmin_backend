const Client = require("../models/Client");
const Project = require("../models/Project");
const Plan = require("../models/Plan");
const Subscription = require("../models/Subscription");
const Payment = require("../models/Payment");
const Notification = require("../models/Notification");
const { asyncHandler } = require("../middleware/errorHandler");
const { getDaysRemaining } = require("../utils/dateHelpers");

// @desc    Get dashboard stats
// @route   GET /api/dashboard
// @access  Private
const getDashboardStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Get counts in parallel
  const [
    totalClients,
    activeClients,
    totalProjects,
    activeProjects,
    totalPlans,
    totalSubscriptions,
    activeSubscriptions,
    expiringSubscriptions,
    expiredSubscriptions,
    gracePeriodSubscriptions,
    suspendedSubscriptions,
    expiringIn30Subscriptions,
  ] = await Promise.all([
    Client.countDocuments(),
    Client.countDocuments({ status: "active" }),
    Project.countDocuments(),
    Project.countDocuments({ status: "active" }),
    Plan.countDocuments(),
    Subscription.countDocuments(),
    Subscription.countDocuments({
      status: "active",
      expiryDate: { $gt: now },
    }),
    Subscription.countDocuments({ status: "expiring" }),
    Subscription.countDocuments({ status: "expired" }),
    Subscription.countDocuments({ status: "grace_period" }),
    Subscription.countDocuments({ status: "suspended" }),
    Subscription.countDocuments({
      status: { $in: ["active", "expiring"] },
      expiryDate: { $lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), $gt: now },
    }),
  ]);

  // Payment stats - aggregate by status
  const paymentStats = await Payment.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        total: { $sum: "$amount" },
      },
    },
  ]);

  // Convert array to key-value object
  const paymentStatsObj = paymentStats.reduce((acc, curr) => {
    acc[curr._id] = curr;
    return acc;
  }, {});

  // Revenue calculations
  const revenueResult = await Payment.aggregate([
    { $match: { status: "success" } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  const monthlyRevenueResult = await Payment.aggregate([
    { $match: { status: "success", paidAt: { $gte: startOfMonth } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);

  res.json({
    success: true,
    stats: {
      clients: {
        total: totalClients,
        active: activeClients,
        inactive: totalClients - activeClients,
        suspended: 0,
      },
      projects: {
        total: totalProjects,
        active: activeProjects,
        inactive: totalProjects - activeProjects,
        suspended: 0,
      },
      plans: totalPlans,
      subscriptions: {
        total: totalSubscriptions,
        active: activeSubscriptions,
        expiring: expiringSubscriptions,
        expired: expiredSubscriptions,
        gracePeriod: gracePeriodSubscriptions,
        suspended: suspendedSubscriptions,
        expiringIn30: expiringIn30Subscriptions,
      },
      payments: {
        total: paymentStats.reduce((sum, p) => sum + p.count, 0),
        success: paymentStatsObj.success?.count || 0,
        pending: paymentStatsObj.pending?.count || 0,
        failed: paymentStatsObj.failed?.count || 0,
        totalRevenue: revenueResult[0]?.total || 0,
        monthlyRevenue: monthlyRevenueResult[0]?.total || 0,
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

  const [
    recentClients,
    recentPayments,
    expiringProjects,
    expiredProjects,
    failedPayments,
    unreadNotifications,
    allExpiringSoon,
  ] = await Promise.all([
    // Recent clients
    Client.find().sort({ createdAt: -1 }).limit(5).select("companyName clientId email status createdAt"),

    // Recent successful payments
    Payment.find({ status: "success" })
      .sort({ paidAt: -1 })
      .limit(5)
      .populate("clientId", "companyName")
      .populate("projectId", "projectName")
      .select("amount paidAt status paymentId currency clientId projectId"),

    // Expiring subscriptions (within 30 days) - top 5 closest
    Subscription.find({
      status: { $in: ["active", "expiring"] },
      expiryDate: { $lte: thirtyDaysFromNow, $gt: now },
    })
      .sort({ expiryDate: 1 })
      .limit(5)
      .populate("clientId", "companyName clientId email")
      .populate("projectId", "projectName projectId")
      .populate("planId", "name price"),

    // Already expired subscriptions
    Subscription.find({
      expiryDate: { $lt: now },
      status: { $ne: "cancelled" },
    })
      .sort({ expiryDate: -1 })
      .limit(5)
      .populate("clientId", "companyName clientId")
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

    // ALL expiring soon (full list, no limit) - for summary count
    Subscription.find({
      status: { $in: ["active", "expiring"] },
      expiryDate: { $lte: thirtyDaysFromNow, $gt: now },
    })
      .sort({ expiryDate: 1 })
      .populate("clientId", "companyName clientId")
      .populate("projectId", "projectName projectId")
      .populate("planId", "name price"),
  ]);

  // Add days remaining to expiring projects
  const expiringWithDays = expiringProjects.map((sub) => ({
    ...sub.toObject(),
    daysRemaining: getDaysRemaining(sub.expiryDate),
  }));

  const expiredWithDays = expiredProjects.map((sub) => ({
    ...sub.toObject(),
    daysExpired: Math.abs(getDaysRemaining(sub.expiryDate)),
  }));

  const allExpiringWithDays = allExpiringSoon.map((sub) => ({
    ...sub.toObject(),
    daysRemaining: getDaysRemaining(sub.expiryDate),
  }));

  // Calculate summary for banner
  const summary = {
    expiringCount: allExpiringSoon.length,
    expiredCount: expiredProjects.length,
    criticalCount: allExpiringSoon.filter(
      (s) => getDaysRemaining(s.expiryDate) <= 7
    ).length,
  };

  res.json({
    success: true,
    widgets: {
      recentClients,
      recentPayments,
      expiringProjects: expiringWithDays,
      expiredProjects: expiredWithDays,
      allExpiringSoon: allExpiringWithDays,
      failedPayments,
      notifications: unreadNotifications,
      summary,
    },
  });
});

module.exports = {
  getDashboardStats,
  getDashboardWidgets,
};