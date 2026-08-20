const express = require("express");
const router = express.Router();
const {
  getDomains,
  getDomain,
  createDomain,
  updateDomain,
  deleteDomain,
} = require("../controllers/domainController");
const { protect, authorize } = require("../middleware/auth");

router
  .route("/")
  .get(protect, getDomains)
  .post(protect, authorize("super_admin", "admin"), createDomain);
router
  .route("/:id")
  .get(protect, getDomain)
  .put(protect, authorize("super_admin", "admin"), updateDomain)
  .delete(protect, authorize("super_admin"), deleteDomain);

module.exports = router;
