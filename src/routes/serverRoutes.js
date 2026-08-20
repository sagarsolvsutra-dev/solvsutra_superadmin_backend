const express = require("express");
const router = express.Router();
const {
  getServers,
  getServer,
  createServer,
  updateServer,
  deleteServer,
} = require("../controllers/serverController");
const { protect, authorize } = require("../middleware/auth");

router
  .route("/")
  .get(protect, authorize("super_admin", "developer"), getServers)
  .post(protect, authorize("super_admin", "developer"), createServer);
router
  .route("/:id")
  .get(protect, authorize("super_admin", "developer"), getServer)
  .put(protect, authorize("super_admin", "developer"), updateServer)
  .delete(protect, authorize("super_admin"), deleteServer);

module.exports = router;
