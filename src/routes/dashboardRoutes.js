const express = require("express");
const router = express.Router();
const {
  getDashboardStats,
  getDashboardWidgets,
} = require("../controllers/dashboardController");
const { protect } = require("../middleware/auth");

router.get("/", protect, getDashboardStats);
router.get("/widgets", protect, getDashboardWidgets);

module.exports = router;
