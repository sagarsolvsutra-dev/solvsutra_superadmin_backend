const Plan = require("../models/Plan");
const ActivityLog = require("../models/ActivityLog");
const { generatePlanId } = require("../utils/generateIds");
const { asyncHandler } = require("../middleware/errorHandler");

// @desc    Get all plans
// @route   GET /api/plans
// @access  Private
const getPlans = asyncHandler(async (req, res) => {
  const { status, search, page = 1, limit = 50 } = req.query;
  const query = {};

  if (status) query.status = status;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { planId: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [plans, total] = await Promise.all([
    Plan.find(query).sort({ sortOrder: 1, createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Plan.countDocuments(query),
  ]);

  res.json({
    success: true,
    count: plans.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    plans,
  });
});

// @desc    Get single plan
// @route   GET /api/plans/:id
// @access  Private
const getPlan = asyncHandler(async (req, res) => {
  const plan = await Plan.findById(req.params.id);

  if (!plan) {
    return res.status(404).json({
      success: false,
      message: "Plan not found",
    });
  }

  res.json({
    success: true,
    plan,
  });
});

// @desc    Create plan
// @route   POST /api/plans
// @access  Private
const createPlan = asyncHandler(async (req, res) => {
  const { name, description, price, currency, duration, durationUnit, features, isFree, sortOrder } = req.body;

  const plan = await Plan.create({
    planId: generatePlanId(),
    name,
    description,
    price: isFree ? 0 : price,
    currency: currency || "INR",
    duration: duration || 1,
    durationUnit: durationUnit || "year",
    features: features || [],
    isFree: isFree || false,
    sortOrder: sortOrder || 0,
  });

  await ActivityLog.create({
    userId: req.user._id,
    action: "CREATE",
    entity: "Plan",
    entityId: plan._id.toString(),
    metadata: { name, price, duration, durationUnit },
    ipAddress: req.ip,
  });

  res.status(201).json({
    success: true,
    plan,
  });
});

// @desc    Update plan
// @route   PUT /api/plans/:id
// @access  Private
const updatePlan = asyncHandler(async (req, res) => {
  const { name, description, price, currency, duration, durationUnit, features, isFree, status, sortOrder } = req.body;

  const plan = await Plan.findById(req.params.id);

  if (!plan) {
    return res.status(404).json({
      success: false,
      message: "Plan not found",
    });
  }

  if (name) plan.name = name;
  if (description !== undefined) plan.description = description;
  if (price !== undefined) plan.price = isFree ? 0 : price;
  if (currency) plan.currency = currency;
  if (duration) plan.duration = duration;
  if (durationUnit) plan.durationUnit = durationUnit;
  if (features) plan.features = features;
  if (isFree !== undefined) {
    plan.isFree = isFree;
    if (isFree) plan.price = 0;
  }
  if (status) plan.status = status;
  if (sortOrder !== undefined) plan.sortOrder = sortOrder;

  await plan.save();

  await ActivityLog.create({
    userId: req.user._id,
    action: "UPDATE",
    entity: "Plan",
    entityId: plan._id.toString(),
    metadata: { name, price, status },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    plan,
  });
});

// @desc    Delete plan (hard delete)
// @route   DELETE /api/plans/:id
// @access  Private
const deletePlan = asyncHandler(async (req, res) => {
  const plan = await Plan.findById(req.params.id);

  if (!plan) {
    return res.status(404).json({
      success: false,
      message: "Plan not found",
    });
  }

  // Prevent deletion of the FREE plan (it's used as the default for new clients)
  if (plan.planId === "PLN_FREE") {
    return res.status(400).json({
      success: false,
      message: "Cannot delete the Free plan. It is the default plan for new clients.",
    });
  }

  await plan.deleteOne();

  await ActivityLog.create({
    userId: req.user._id,
    action: "DELETE",
    entity: "Plan",
    entityId: plan._id.toString(),
    metadata: { name: plan.name },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: "Plan deleted",
  });
});

module.exports = {
  getPlans,
  getPlan,
  createPlan,
  updatePlan,
  deletePlan,
};
