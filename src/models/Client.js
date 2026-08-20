const mongoose = require("mongoose");

const clientSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, unique: true },
    companyName: { type: String, required: true, trim: true },
    contactPerson: { type: String, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    country: { type: String, default: "India", trim: true },
    gstNumber: { type: String, trim: true },
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

// Index for faster queries
clientSchema.index({ clientId: 1 });
clientSchema.index({ email: 1 });
clientSchema.index({ status: 1 });
clientSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Client", clientSchema);
