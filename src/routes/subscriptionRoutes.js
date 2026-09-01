const express = require("express");
const router = express.Router();
const {
  getSubscriptions,
  getSubscription,
  getSubscriptionByProject,
  createSubscription,
  updateSubscription,
  deleteSubscription,
  renewSubscription,
  suspendSubscription,
  getSubscriptionStats,
} = require("../controllers/subscriptionController");
const { protect, authorize, verifyProjectApi } = require("../middleware/auth");

router.get("/stats", protect, getSubscriptionStats);
router.get(
  "/project/:projectId",
  verifyProjectApi,
  getSubscriptionByProject
);
router
  .route("/")
  .get(protect, getSubscriptions)
  .post(protect, authorize("super_admin", "admin"), createSubscription);
router
  .route("/:id")
  .get(protect, getSubscription)
  .put(protect, authorize("super_admin", "admin"), updateSubscription)
  .delete(protect, authorize("super_admin"), deleteSubscription);
router.post(
  "/:id/renew",
  protect,
  authorize("super_admin", "admin"),
  renewSubscription
);
router.post(
  "/:id/suspend",
  protect,
  authorize("super_admin"),
  suspendSubscription
);

module.exports = router;
