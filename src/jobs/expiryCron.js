const cron = require("node-cron");
const Subscription = require("../models/Subscription");
const Project = require("../models/Project");
const Client = require("../models/Client");
const Plan = require("../models/Plan");
const Notification = require("../models/Notification");
const { generateNotificationId } = require("../utils/generateIds");
const { addDuration, getDaysRemaining } = require("../utils/dateHelpers");

// Notification schedule (days before expiry)
const NOTIFICATION_DAYS = [90, 30, 15, 7, 3, 1];

// Run expiry check daily at midnight
const runExpiryCron = () => {
  // Run daily at midnight
  cron.schedule("0 0 * * *", async () => {
    console.log("🔄 Running daily subscription expiry check...");
    await checkExpiringSubscriptions();
    await checkExpiredSubscriptions();
    await checkGracePeriod();
    console.log("✅ Expiry check completed");
  });

  // Run notification check every hour
  cron.schedule("0 * * * *", async () => {
    console.log("🔔 Running hourly notification check...");
    await createExpiryNotifications();
  });

  console.log("⏰ Cron jobs scheduled");
};

// Check and update expiring subscriptions
const checkExpiringSubscriptions = async () => {
  try {
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    // Update subscriptions that are within 30 days of expiry to "expiring" status
    const expiring = await Subscription.find({
      status: "active",
      expiryDate: { $lte: thirtyDaysFromNow, $gt: now },
    });

    for (const sub of expiring) {
      sub.status = "expiring";
      await sub.save();
    }

    console.log(`📅 Marked ${expiring.length} subscriptions as expiring`);
  } catch (error) {
    console.error("❌ Error checking expiring subscriptions:", error);
  }
};

// Check and update expired subscriptions
const checkExpiredSubscriptions = async () => {
  try {
    const now = new Date();

    // Update active/expiring subscriptions that have passed expiry date
    const expired = await Subscription.find({
      status: { $in: ["active", "expiring"] },
      expiryDate: { $lte: now },
    });

    for (const sub of expired) {
      sub.status = "expired";
      // `?? 7`, not `|| 7` — an admin-configured 0-day grace period is valid
      // and must not be silently overridden back up to 7.
      sub.gracePeriodEndDate = addDuration(now, sub.gracePeriodDays ?? 7, "day");
      await sub.save();

      // Update associated project status
      await Project.findByIdAndUpdate(sub.projectId, { status: "active" });

      // Create expired notification
      await Notification.create({
        notificationId: generateNotificationId(),
        clientId: sub.clientId,
        projectId: sub.projectId,
        subscriptionId: sub._id,
        type: "expired",
        title: "Subscription Expired",
        message: `Your subscription has expired. Please renew to continue using the service.`,
        data: { expiryDate: sub.expiryDate },
      });
    }

    console.log(`⏰ Marked ${expired.length} subscriptions as expired`);
  } catch (error) {
    console.error("❌ Error checking expired subscriptions:", error);
  }
};

// Check and handle grace period
const checkGracePeriod = async () => {
  try {
    const now = new Date();

    // Find subscriptions in grace period that have passed the grace period end date
    const beyondGrace = await Subscription.find({
      status: "grace_period",
      gracePeriodEndDate: { $lte: now },
    });

    for (const sub of beyondGrace) {
      sub.status = "suspended";
      await sub.save();

      // Update associated project status to suspended
      await Project.findByIdAndUpdate(sub.projectId, { status: "suspended" });

      // Create suspension notification
      await Notification.create({
        notificationId: generateNotificationId(),
        clientId: sub.clientId,
        projectId: sub.projectId,
        subscriptionId: sub._id,
        type: "suspension",
        title: "Project Suspended",
        message: `Your project has been suspended due to subscription non-renewal.`,
      });
    }

    console.log(`🚫 Suspended ${beyondGrace.length} projects`);
  } catch (error) {
    console.error("�� Error checking grace period:", error);
  }
};

// Create expiry warning notifications
const createExpiryNotifications = async () => {
  try {
    const now = new Date();

    // Get all active and expiring subscriptions
    const subscriptions = await Subscription.find({
      status: { $in: ["active", "expiring"] },
    }).populate("clientId projectId planId");

    for (const sub of subscriptions) {
      const daysRemaining = getDaysRemaining(sub.expiryDate);

      // Check if we need to send a notification for this day
      if (NOTIFICATION_DAYS.includes(daysRemaining)) {
        // Check if notification already exists for this day
        const existingNotification = await Notification.findOne({
          subscriptionId: sub._id,
          type: "expiry_warning",
          createdAt: { $gte: new Date(now.setHours(0, 0, 0, 0)) },
        });

        if (!existingNotification) {
          const plan = await Plan.findById(sub.planId);

          await Notification.create({
            notificationId: generateNotificationId(),
            clientId: sub.clientId?._id,
            projectId: sub.projectId?._id,
            subscriptionId: sub._id,
            type: "expiry_warning",
            title: `Subscription expires in ${daysRemaining} days`,
            message: `Your ${plan?.name || "subscription"} will expire on ${sub.expiryDate.toLocaleDateString()}. Please renew to continue using the service.`,
            data: {
              daysRemaining,
              expiryDate: sub.expiryDate,
              planName: plan?.name,
            },
          });
        }
      }
    }
  } catch (error) {
    console.error("❌ Error creating expiry notifications:", error);
  }
};

module.exports = { runExpiryCron, checkExpiringSubscriptions, checkExpiredSubscriptions, createExpiryNotifications };
