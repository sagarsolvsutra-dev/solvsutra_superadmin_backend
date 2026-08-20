const ActivityLog = require("../models/ActivityLog");
const { asyncHandler } = require("../middleware/errorHandler");

// @desc    Get all activity logs
// @route   GET /api/activity-logs
// @access  Private
const getActivityLogs = asyncHandler(async (req, res) => {
  const { userId, action, entity, entityId, page = 1, limit = 50 } = req.query;
  const query = {};

  if (userId) query.userId = userId;
  if (action) query.action = action;
  if (entity) query.entity = entity;
  if (entityId) query.entityId = entityId;

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [logs, total] = await Promise.all([
    ActivityLog.find(query)
      .populate("userId", "name email role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    ActivityLog.countDocuments(query),
  ]);

  res.json({
    success: true,
    count: logs.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    logs,
  });
});

// @desc    Get recent activity
// @route   GET /api/activity-logs/recent
// @access  Private
const getRecentActivity = asyncHandler(async (req, res) => {
  const { limit = 20 } = req.query;

  const logs = await ActivityLog.find()
    .populate("userId", "name email role")
    .sort({ createdAt: -1 })
    .limit(parseInt(limit));

  res.json({
    success: true,
    logs,
  });
});

module.exports = {
  getActivityLogs,
  getRecentActivity,
};
