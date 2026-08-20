const express = require("express");
const router = express.Router();
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  getUnreadCount,
} = require("../controllers/notificationController");
const { protect } = require("../middleware/auth");

router.get("/unread-count", protect, getUnreadCount);
router.put("/read-all", protect, markAllAsRead);
router
  .route("/")
  .get(protect, getNotifications)
  .delete(protect, deleteNotification);
router.put("/:id/read", protect, markAsRead);
router.delete("/:id", protect, deleteNotification);

module.exports = router;
