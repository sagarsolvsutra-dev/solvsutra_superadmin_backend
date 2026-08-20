const express = require("express");
const router = express.Router();
const { razorpayWebhook } = require("../controllers/paymentController");

// Razorpay webhook
router.post("/razorpay", razorpayWebhook);

module.exports = router;
