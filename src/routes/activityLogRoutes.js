const express = require("express");
const router = express.Router();
const { getActivityLogs, getRecentActivity } = require("../controllers/activityLogController");
const { protect, authorize } = require("../middleware/auth");

router.get("/recent", protect, getRecentActivity);
router.get("/", protect, authorize("super_admin"), getActivityLogs);

module.exports = router;
