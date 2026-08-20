const User = require("../models/User");
const ActivityLog = require("../models/ActivityLog");
const { generateToken } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Please provide email and password",
    });
  }

  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Invalid credentials",
    });
  }

  if (!user.isActive) {
    return res.status(401).json({
      success: false,
      message: "Account is deactivated",
    });
  }

  const isMatch = await user.matchPassword(password);

  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: "Invalid credentials",
    });
  }

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  // Log activity
  await ActivityLog.create({
    userId: user._id,
    action: "LOGIN",
    entity: "User",
    entityId: user._id.toString(),
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  });

  const token = generateToken(user._id);

  res.json({
    success: true,
    token,
    user: user.toJSON(),
  });
});

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  res.json({
    success: true,
    user,
  });
});

// @desc    Register user
// @route   POST /api/auth/register
// @access  Private (Super Admin only)
const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, role } = req.body;

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return res.status(400).json({
      success: false,
      message: "User already exists with this email",
    });
  }

  const user = await User.create({
    name,
    email: email.toLowerCase(),
    password,
    phone,
    role: role || "admin",
  });

  await ActivityLog.create({
    userId: req.user._id,
    action: "CREATE",
    entity: "User",
    entityId: user._id.toString(),
    metadata: { name, email, role },
    ipAddress: req.ip,
  });

  const token = generateToken(user._id);

  res.status(201).json({
    success: true,
    token,
    user,
  });
});

// @desc    Update user
// @route   PUT /api/auth/users/:id
// @access  Private
const updateUser = asyncHandler(async (req, res) => {
  const { name, email, phone, role, isActive, password } = req.body;

  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  if (name) user.name = name;
  if (email) user.email = email.toLowerCase();
  if (phone) user.phone = phone;
  if (role) user.role = role;
  if (isActive !== undefined) user.isActive = isActive;
  if (password) user.password = password;

  await user.save();

  await ActivityLog.create({
    userId: req.user._id,
    action: "UPDATE",
    entity: "User",
    entityId: user._id.toString(),
    metadata: { name, email, role, isActive },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    user,
  });
});

// @desc    Get all users
// @route   GET /api/auth/users
// @access  Private
const getUsers = asyncHandler(async (req, res) => {
  const { role, isActive, search } = req.query;
  const query = {};

  if (role) query.role = role;
  if (isActive !== undefined) query.isActive = isActive === "true";
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const users = await User.find(query).sort({ createdAt: -1 });

  res.json({
    success: true,
    count: users.length,
    users,
  });
});

// @desc    Delete user
// @route   DELETE /api/auth/users/:id
// @access  Private
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  if (user.role === "super_admin") {
    return res.status(403).json({
      success: false,
      message: "Cannot delete super admin",
    });
  }

  // Soft delete - deactivate
  user.isActive = false;
  await user.save();

  await ActivityLog.create({
    userId: req.user._id,
    action: "DELETE",
    entity: "User",
    entityId: user._id.toString(),
    metadata: { name: user.name },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: "User deactivated",
  });
});

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id);

  if (!(await user.matchPassword(currentPassword))) {
    return res.status(400).json({
      success: false,
      message: "Current password is incorrect",
    });
  }

  user.password = newPassword;
  await user.save();

  await ActivityLog.create({
    userId: user._id,
    action: "CHANGE_PASSWORD",
    entity: "User",
    entityId: user._id.toString(),
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: "Password changed successfully",
  });
});

module.exports = {
  login,
  getMe,
  register,
  updateUser,
  getUsers,
  deleteUser,
  changePassword,
};
