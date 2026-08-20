const express = require("express");
const router = express.Router();
const {
  getPayments,
  getPayment,
  createOrder,
  verifyPayment,
  getPaymentStats,
} = require("../controllers/paymentController");
const { protect, authorize } = require("../middleware/auth");

router.get("/stats", protect, getPaymentStats);
router
  .route("/")
  .get(protect, authorize("super_admin", "admin", "accountant"), getPayments);
router
  .route("/create-order")
  .post(protect, authorize("super_admin", "admin", "accountant"), createOrder);
router
  .route("/verify")
  .post(protect, authorize("super_admin", "admin", "accountant"), verifyPayment);
router
  .route("/:id")
  .get(protect, authorize("super_admin", "admin", "accountant"), getPayment);

module.exports = router;
