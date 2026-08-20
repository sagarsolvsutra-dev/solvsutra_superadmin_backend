const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    notificationId: { type: String, required: true, unique: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "Client" },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription" },
    type: {
      type: String,
      enum: [
        "expiry_warning",
        "expired",
        "payment_success",
        "payment_failed",
        "subscription_renewed",
        "subscription_created",
        "subscription_suspended",
        "suspension",
        "system",
      ],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
    data: { type: mongoose.Schema.Types.Mixed },
    emailSent: { type: Boolean, default: false },
    emailSentAt: { type: Date },
  },
  { timestamps: true }
);

// Indexes
notificationSchema.index({ notificationId: 1 });
notificationSchema.index({ clientId: 1 });
notificationSchema.index({ projectId: 1 });
notificationSchema.index({ subscriptionId: 1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ isRead: 1 });
notificationSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
