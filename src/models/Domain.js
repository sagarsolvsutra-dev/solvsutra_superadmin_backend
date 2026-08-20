const mongoose = require("mongoose");

const domainSchema = new mongoose.Schema(
  {
    domainId: { type: String, required: true, unique: true },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      set: function(v) {
        // Convert empty string to undefined
        return v === "" || v === null ? undefined : v;
      },
    },
    domain: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["main", "subdomain", "redirect"],
      default: "main",
    },
    sslEnabled: { type: Boolean, default: true },
    sslExpiry: { type: Date },
    provider: { type: String, trim: true },
    dnsProvider: { type: String, trim: true },
    nameservers: [{ type: String }],
    status: {
      type: String,
      enum: ["active", "pending", "expired", "suspended"],
      default: "active",
    },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

domainSchema.index({ domainId: 1 });
domainSchema.index({ projectId: 1 });
domainSchema.index({ domain: 1 });

module.exports = mongoose.model("Domain", domainSchema);
