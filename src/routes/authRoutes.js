const express = require("express");
const router = express.Router();
const {
  login,
  getMe,
  register,
  updateUser,
  getUsers,
  deleteUser,
  changePassword,
} = require("../controllers/authController");
const { protect, authorize } = require("../middleware/auth");

router.post("/login", login);
router.get("/me", protect, getMe);
router.put("/change-password", protect, changePassword);
router.post("/register", protect, authorize("super_admin"), register);
router.route("/users").get(protect, getUsers);
router
  .route("/users/:id")
  .put(protect, updateUser)
  .delete(protect, authorize("super_admin"), deleteUser);

module.exports = router;
