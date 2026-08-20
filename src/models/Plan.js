const mongoose = require("mongoose");

const planSchema = new mongoose.Schema(
  {
    planId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    price: { type: Number, required: true, default: 0 },
    currency: { type: String, default: "INR" },
    duration: { type: Number, required: true, default: 1 },
    durationUnit: {
      type: String,
      enum: ["day", "month", "year"],
      default: "year",
    },
    features: [{ type: String }],
    isFree: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Indexes
planSchema.index({ planId: 1 });
planSchema.index({ status: 1 });
planSchema.index({ sortOrder: 1 });

module.exports = mongoose.model("Plan", planSchema);
