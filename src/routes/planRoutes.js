const express = require("express");
const router = express.Router();
const {
  getPlans,
  getPlan,
  createPlan,
  updatePlan,
  deletePlan,
} = require("../controllers/planController");
const { protect, authorize } = require("../middleware/auth");

router
  .route("/")
  .get(protect, getPlans)
  .post(protect, authorize("super_admin", "admin"), createPlan);
router
  .route("/:id")
  .get(protect, getPlan)
  .put(protect, authorize("super_admin", "admin"), updatePlan)
  .delete(protect, authorize("super_admin"), deletePlan);

module.exports = router;
