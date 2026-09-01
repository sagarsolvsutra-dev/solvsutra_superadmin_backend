const mongoose = require("mongoose");

const employeeSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    department: { type: String, trim: true },
    designation: { type: String, trim: true },
    joinDate: { type: Date },
    employmentStatus: {
      type: String,
      enum: ["active", "on_leave", "inactive"],
      default: "active",
    },
    address: { type: String, trim: true },
    // Set only when this employee also has a login account in the panel —
    // most staff (e.g. drivers, on-site crew) never will.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

employeeSchema.index({ employeeId: 1 });
employeeSchema.index({ employmentStatus: 1 });
employeeSchema.index({ department: 1 });

module.exports = mongoose.model("Employee", employeeSchema);
