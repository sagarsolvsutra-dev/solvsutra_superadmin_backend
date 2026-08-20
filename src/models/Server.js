const mongoose = require("mongoose");

const serverSchema = new mongoose.Schema(
  {
    serverId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    provider: { type: String, trim: true },
    ipAddress: { type: String, trim: true },
    hostname: { type: String, trim: true },
    sshPort: { type: Number, default: 22 },
    sshUsername: { type: String, trim: true },
    // Store encrypted SSH key - never expose plain text
    sshKeyFingerprint: { type: String, trim: true },
    os: { type: String, trim: true },
    ram: { type: String, trim: true },
    storage: { type: String, trim: true },
    status: {
      type: String,
      enum: ["active", "inactive", "maintenance"],
      default: "active",
    },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

serverSchema.index({ serverId: 1 });
serverSchema.index({ status: 1 });

module.exports = mongoose.model("Server", serverSchema);
