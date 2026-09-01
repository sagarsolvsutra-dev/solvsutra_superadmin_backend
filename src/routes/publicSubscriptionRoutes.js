const express = require("express");
const router = express.Router();
const {
  authenticateProject,
  getMySubscription,
  getAccessStatus,
  getAvailablePlans,
  createRenewalOrder,
  verifyRenewalPayment,
  getMyPayments,
  getMyNotifications,
} = require("../controllers/publicSubscriptionController");

// All routes use API key auth
router.use(authenticateProject);

// Get subscription details
router.get("/my", getMySubscription);

// Lightweight write-permission check (used by client backends)
router.get("/access", getAccessStatus);

// Get available plans
router.get("/plans", getAvailablePlans);

// Create renewal order
router.post("/renew/create-order", createRenewalOrder);

// Verify payment
router.post("/renew/verify", verifyRenewalPayment);

// Get payments
router.get("/payments", getMyPayments);

// Get notifications
router.get("/notifications", getMyNotifications);

module.exports = router;