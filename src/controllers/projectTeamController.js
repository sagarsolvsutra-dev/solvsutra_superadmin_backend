const mongoose = require("mongoose");
const Project = require("../models/Project");
const User = require("../models/User");
const ProjectAssignment = require("../models/ProjectAssignment");
const ProjectMilestone = require("../models/ProjectMilestone");
const ActivityLog = require("../models/ActivityLog");
const { generateAssignmentId, generateMilestoneId } = require("../utils/generateIds");
const { asyncHandler } = require("../middleware/errorHandler");

const USER_FIELDS = "name email role phone isActive";

const logActivity = async (req, action, entityId, metadata) => {
  try {
    await ActivityLog.create({
      userId: req.user?._id,
      action,
      entity: "Project",
      entityId,
      metadata,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
  } catch (err) {
    // Audit logging must never break the request it is describing.
    console.error("ActivityLog failed:", err.message);
  }
};

const findProjectOr404 = async (id, res) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ success: false, message: "Invalid project id" });
    return null;
  }
  const project = await Project.findById(id);
  if (!project) {
    res.status(404).json({ success: false, message: "Project not found" });
    return null;
  }
  return project;
};

// ============================================================
//  STAFF ASSIGNMENTS
// ============================================================

// @desc    List staff assigned to a project
// @route   GET /api/projects/:id/staff
// @access  Private
const getProjectStaff = asyncHandler(async (req, res) => {
  const project = await findProjectOr404(req.params.id, res);
  if (!project) return;

  // ?includeInactive=true also returns people who have rolled off.
  const query = { projectId: project._id };
  if (req.query.includeInactive !== "true") query.isActive = true;

  const assignments = await ProjectAssignment.find(query)
    .populate("userId", USER_FIELDS)
    .populate("assignedBy", "name email")
    .sort({ isActive: -1, createdAt: -1 });

  const active = assignments.filter((a) => a.isActive);

  res.json({
    success: true,
    count: assignments.length,
    activeCount: active.length,
    totalAllocation: active.reduce((sum, a) => sum + (a.allocationPercent || 0), 0),
    assignments,
  });
});

// @desc    Assign a staff member to a project
// @route   POST /api/projects/:id/staff
// @access  Private (super_admin, admin)
const assignStaff = asyncHandler(async (req, res) => {
  const project = await findProjectOr404(req.params.id, res);
  if (!project) return;

  const { userId, role, allocationPercent, startDate, endDate, notes } = req.body;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ success: false, message: "A valid userId is required" });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({ success: false, message: "User not found" });
  }
  if (user.isActive === false) {
    return res
      .status(400)
      .json({ success: false, message: "Cannot assign a deactivated user" });
  }

  // Re-assigning someone already on the project updates their row rather than
  // creating a duplicate (the partial unique index would reject it anyway).
  const existing = await ProjectAssignment.findOne({
    projectId: project._id,
    userId,
    isActive: true,
  });

  if (existing) {
    if (role) existing.role = role;
    if (allocationPercent !== undefined) existing.allocationPercent = allocationPercent;
    if (startDate) existing.startDate = startDate;
    if (endDate !== undefined) existing.endDate = endDate || undefined;
    if (notes !== undefined) existing.notes = notes;
    await existing.save();
    await existing.populate("userId", USER_FIELDS);

    await logActivity(req, "project_staff_updated", project._id, {
      projectName: project.projectName,
      staffName: user.name,
      role: existing.role,
    });

    return res.json({
      success: true,
      message: `${user.name} ni assignment update thai`,
      assignment: existing,
      updated: true,
    });
  }

  const assignment = await ProjectAssignment.create({
    assignmentId: generateAssignmentId(),
    projectId: project._id,
    userId,
    role: role || "developer",
    allocationPercent: allocationPercent !== undefined ? allocationPercent : 100,
    startDate: startDate || new Date(),
    endDate: endDate || undefined,
    notes,
    assignedBy: req.user?._id,
  });

  await assignment.populate("userId", USER_FIELDS);

  await logActivity(req, "project_staff_assigned", project._id, {
    projectName: project.projectName,
    staffName: user.name,
    role: assignment.role,
  });

  res.status(201).json({
    success: true,
    message: `${user.name} ne ${project.projectName} par assign karyo`,
    assignment,
  });
});

// @desc    Update an assignment
// @route   PUT /api/projects/:id/staff/:assignmentId
// @access  Private (super_admin, admin)
const updateAssignment = asyncHandler(async (req, res) => {
  const project = await findProjectOr404(req.params.id, res);
  if (!project) return;

  const assignment = await ProjectAssignment.findOne({
    _id: req.params.assignmentId,
    projectId: project._id,
  });
  if (!assignment) {
    return res.status(404).json({ success: false, message: "Assignment not found" });
  }

  const { role, allocationPercent, startDate, endDate, notes, isActive } = req.body;
  if (role !== undefined) assignment.role = role;
  if (allocationPercent !== undefined) assignment.allocationPercent = allocationPercent;
  if (startDate !== undefined) assignment.startDate = startDate;
  if (endDate !== undefined) assignment.endDate = endDate || undefined;
  if (notes !== undefined) assignment.notes = notes;
  if (isActive !== undefined) {
    assignment.isActive = isActive;
    if (!isActive && !assignment.endDate) assignment.endDate = new Date();
  }

  await assignment.save();
  await assignment.populate("userId", USER_FIELDS);

  await logActivity(req, "project_staff_updated", project._id, {
    projectName: project.projectName,
    assignmentId: assignment.assignmentId,
  });

  res.json({ success: true, message: "Assignment updated", assignment });
});

// @desc    Remove a staff member from a project
// @route   DELETE /api/projects/:id/staff/:assignmentId
// @access  Private (super_admin, admin)
const removeAssignment = asyncHandler(async (req, res) => {
  const project = await findProjectOr404(req.params.id, res);
  if (!project) return;

  const assignment = await ProjectAssignment.findOne({
    _id: req.params.assignmentId,
    projectId: project._id,
  }).populate("userId", USER_FIELDS);

  if (!assignment) {
    return res.status(404).json({ success: false, message: "Assignment not found" });
  }

  // ?hard=true wipes the row; the default keeps it as history.
  if (req.query.hard === "true") {
    await assignment.deleteOne();
  } else {
    assignment.isActive = false;
    if (!assignment.endDate) assignment.endDate = new Date();
    await assignment.save();
  }

  await logActivity(req, "project_staff_removed", project._id, {
    projectName: project.projectName,
    staffName: assignment.userId?.name,
  });

  res.json({ success: true, message: "Staff removed from project" });
});

// @desc    Staff counts for many projects at once (for the projects list)
// @route   GET /api/projects/staff-summary
// @access  Private
const getStaffSummary = asyncHandler(async (req, res) => {
  const rows = await ProjectAssignment.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: "$projectId",
        staffCount: { $sum: 1 },
        totalAllocation: { $sum: "$allocationPercent" },
      },
    },
  ]);

  const byProject = {};
  rows.forEach((r) => {
    byProject[String(r._id)] = {
      staffCount: r.staffCount,
      totalAllocation: r.totalAllocation,
    };
  });

  res.json({ success: true, summary: byProject });
});

// @desc    Every project a given user is working on
// @route   GET /api/projects/staff/:userId/projects
// @access  Private
const getUserProjects = asyncHandler(async (req, res) => {
  const assignments = await ProjectAssignment.find({
    userId: req.params.userId,
    isActive: true,
  })
    .populate("projectId", "projectName projectId status environment")
    .sort({ createdAt: -1 });

  res.json({ success: true, count: assignments.length, assignments });
});

// ============================================================
//  TIMELINE / MILESTONES
// ============================================================

// @desc    List a project's timeline
// @route   GET /api/projects/:id/milestones
// @access  Private
const getMilestones = asyncHandler(async (req, res) => {
  const project = await findProjectOr404(req.params.id, res);
  if (!project) return;

  const query = { projectId: project._id };
  if (req.query.status) query.status = req.query.status;

  const milestones = await ProjectMilestone.find(query)
    .populate("ownerId", USER_FIELDS)
    .populate("createdBy", "name email")
    .sort({ date: 1, createdAt: 1 });

  const counts = { planned: 0, in_progress: 0, completed: 0, blocked: 0 };
  milestones.forEach((m) => {
    if (counts[m.status] !== undefined) counts[m.status] += 1;
  });

  const progress = milestones.length
    ? Math.round((counts.completed / milestones.length) * 100)
    : 0;

  res.json({ success: true, count: milestones.length, counts, progress, milestones });
});

// @desc    Add a timeline entry
// @route   POST /api/projects/:id/milestones
// @access  Private (super_admin, admin, developer)
const createMilestone = asyncHandler(async (req, res) => {
  const project = await findProjectOr404(req.params.id, res);
  if (!project) return;

  const { title, description, date, status, ownerId } = req.body;

  if (!title || !String(title).trim()) {
    return res.status(400).json({ success: false, message: "Title is required" });
  }

  const milestone = await ProjectMilestone.create({
    milestoneId: generateMilestoneId(),
    projectId: project._id,
    title: String(title).trim(),
    description,
    date: date || new Date(),
    status: status || "planned",
    completedAt: status === "completed" ? new Date() : undefined,
    ownerId: ownerId || undefined,
    createdBy: req.user?._id,
  });

  await milestone.populate("ownerId", USER_FIELDS);

  await logActivity(req, "project_milestone_added", project._id, {
    projectName: project.projectName,
    title: milestone.title,
  });

  res.status(201).json({ success: true, message: "Milestone added", milestone });
});

// @desc    Update a timeline entry
// @route   PUT /api/projects/:id/milestones/:milestoneId
// @access  Private (super_admin, admin, developer)
const updateMilestone = asyncHandler(async (req, res) => {
  const project = await findProjectOr404(req.params.id, res);
  if (!project) return;

  const milestone = await ProjectMilestone.findOne({
    _id: req.params.milestoneId,
    projectId: project._id,
  });
  if (!milestone) {
    return res.status(404).json({ success: false, message: "Milestone not found" });
  }

  const { title, description, date, status, ownerId } = req.body;
  if (title !== undefined) milestone.title = title;
  if (description !== undefined) milestone.description = description;
  if (date !== undefined) milestone.date = date;
  if (ownerId !== undefined) milestone.ownerId = ownerId || undefined;

  if (status !== undefined && status !== milestone.status) {
    milestone.status = status;
    // Stamp the completion time on the transition, and clear it if reopened.
    milestone.completedAt = status === "completed" ? new Date() : undefined;
  }

  await milestone.save();
  await milestone.populate("ownerId", USER_FIELDS);

  await logActivity(req, "project_milestone_updated", project._id, {
    projectName: project.projectName,
    title: milestone.title,
    status: milestone.status,
  });

  res.json({ success: true, message: "Milestone updated", milestone });
});

// @desc    Delete a timeline entry
// @route   DELETE /api/projects/:id/milestones/:milestoneId
// @access  Private (super_admin, admin)
const deleteMilestone = asyncHandler(async (req, res) => {
  const project = await findProjectOr404(req.params.id, res);
  if (!project) return;

  const milestone = await ProjectMilestone.findOneAndDelete({
    _id: req.params.milestoneId,
    projectId: project._id,
  });
  if (!milestone) {
    return res.status(404).json({ success: false, message: "Milestone not found" });
  }

  await logActivity(req, "project_milestone_deleted", project._id, {
    projectName: project.projectName,
    title: milestone.title,
  });

  res.json({ success: true, message: "Milestone deleted" });
});

module.exports = {
  getProjectStaff,
  assignStaff,
  updateAssignment,
  removeAssignment,
  getStaffSummary,
  getUserProjects,
  getMilestones,
  createMilestone,
  updateMilestone,
  deleteMilestone,
};
