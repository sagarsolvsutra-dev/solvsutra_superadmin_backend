const mongoose = require("mongoose");

/**
 * Which staff member is working on which project, in what capacity.
 *
 * Kept as its own collection rather than an array on Project so that past
 * assignments stay queryable (set isActive=false + endDate instead of
 * deleting) and so "what is this person working on?" is a cheap query too.
 */
const projectAssignmentSchema = new mongoose.Schema(
  {
    assignmentId: { type: String, required: true, unique: true },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // What they do on THIS project — independent of their User.role,
    // e.g. an 'admin' user can be assigned as 'manager' here.
    role: {
      type: String,
      enum: [
        "project_manager",
        "developer",
        "designer",
        "tester",
        "devops",
        "support",
        "other",
      ],
      default: "developer",
    },
    // Rough capacity, 0-100. Useful for spotting over-allocated staff.
    allocationPercent: { type: Number, min: 0, max: 100, default: 100 },
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
    isActive: { type: Boolean, default: true },
    notes: { type: String, trim: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

projectAssignmentSchema.index({ projectId: 1, isActive: 1 });
projectAssignmentSchema.index({ userId: 1, isActive: 1 });
// One active assignment per person per project — re-assigning updates instead
// of creating a duplicate row.
projectAssignmentSchema.index(
  { projectId: 1, userId: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

module.exports = mongoose.model("ProjectAssignment", projectAssignmentSchema);
