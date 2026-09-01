const express = require("express");
const router = express.Router();
const {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} = require("../controllers/employeeController");
const { protect, authorize } = require("../middleware/auth");

router
  .route("/")
  .get(protect, getEmployees)
  .post(protect, authorize("super_admin", "admin"), createEmployee);
router
  .route("/:id")
  .get(protect, getEmployee)
  .put(protect, authorize("super_admin", "admin"), updateEmployee)
  .delete(protect, authorize("super_admin"), deleteEmployee);

module.exports = router;
