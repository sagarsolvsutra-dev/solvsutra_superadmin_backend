const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    subscriptionId: { type: String, required: true, unique: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client", required: true },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan", required: true },
    startDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    gracePeriodDays: { type: Number, default: 7 },
    gracePeriodEndDate: { type: Date },
    autoRenew: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["pending", "active", "expiring", "expired", "grace_period", "suspended", "cancelled"],
      default: "pending",
    },
    renewalCount: { type: Number, default: 0 },
    lastRenewedAt: { type: Date },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

// Indexes
subscriptionSchema.index({ subscriptionId: 1 });
subscriptionSchema.index({ clientId: 1 });
subscriptionSchema.index({ projectId: 1 });
subscriptionSchema.index({ planId: 1 });
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ expiryDate: 1 });
subscriptionSchema.index({ "expiryDate": 1, "status": 1 });

// Calculate days remaining
subscriptionSchema.methods.getDaysRemaining = function () {
  const now = new Date();
  const diff = this.expiryDate - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

module.exports = mongoose.model("Subscription", subscriptionSchema);
