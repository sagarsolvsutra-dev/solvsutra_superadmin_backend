const express = require("express");
const router = express.Router();
const {
  getClients,
  getClient,
  createClient,
  updateClient,
  deleteClient,
  getClientStats,
} = require("../controllers/clientController");
const { protect, authorize } = require("../middleware/auth");

router.get("/stats", protect, getClientStats);
router.route("/").get(protect, getClients).post(protect, createClient);
router
  .route("/:id")
  .get(protect, getClient)
  .put(protect, updateClient)
  .delete(protect, authorize("super_admin", "admin"), deleteClient);

module.exports = router;
