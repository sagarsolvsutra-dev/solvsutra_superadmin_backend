const mongoose = require("mongoose");

/**
 * Manual timeline entries for a project — "Design done", "Client demo",
 * "Went live". Staff add these by hand; nothing writes them automatically.
 */
const projectMilestoneSchema = new mongoose.Schema(
  {
    milestoneId: { type: String, required: true, unique: true },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    // The date this milestone is planned for (or happened on).
    date: { type: Date, required: true, default: Date.now },
    status: {
      type: String,
      enum: ["planned", "in_progress", "completed", "blocked"],
      default: "planned",
    },
    // Stamped when status first becomes 'completed'.
    completedAt: { type: Date },
    // Optional owner — who is responsible for this milestone.
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

projectMilestoneSchema.index({ projectId: 1, date: 1 });
projectMilestoneSchema.index({ projectId: 1, status: 1 });

module.exports = mongoose.model("ProjectMilestone", projectMilestoneSchema);
