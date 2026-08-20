const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    projectId: { type: String, required: true, unique: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
    projectName: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    frontendUrl: { type: String, trim: true },
    adminUrl: { type: String, trim: true },
    backendUrl: { type: String, trim: true },
    repositoryUrl: { type: String, trim: true },
    environment: {
      type: String,
      enum: ["development", "staging", "production"],
      default: "production",
    },
    serverId: { type: mongoose.Schema.Types.ObjectId, ref: "Server" },
    apiKey: { type: String, required: true, unique: true },
    apiSecret: { type: String, required: true },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },
    techStack: { type: String, trim: true },
    domain: { type: String, trim: true },
  },
  { timestamps: true }
);

// Indexes
projectSchema.index({ projectId: 1 });
projectSchema.index({ clientId: 1 });
projectSchema.index({ status: 1 });
projectSchema.index({ apiKey: 1 });

module.exports = mongoose.model("Project", projectSchema);
