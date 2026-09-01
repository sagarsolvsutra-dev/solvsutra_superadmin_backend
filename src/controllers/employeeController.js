const Employee = require("../models/Employee");
const ActivityLog = require("../models/ActivityLog");
const { generateEmployeeId } = require("../utils/generateIds");
const { asyncHandler } = require("../middleware/errorHandler");

// @desc    Get all employees
// @route   GET /api/employees
// @access  Private
const getEmployees = asyncHandler(async (req, res) => {
  const { employmentStatus, department, search, page = 1, limit = 20 } = req.query;
  const query = {};

  if (employmentStatus) query.employmentStatus = employmentStatus;
  if (department) query.department = department;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { employeeId: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { designation: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [employees, total] = await Promise.all([
    Employee.find(query).populate("userId", "name email role").sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Employee.countDocuments(query),
  ]);

  res.json({
    success: true,
    count: employees.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    employees,
  });
});

// @desc    Get single employee
// @route   GET /api/employees/:id
// @access  Private
const getEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id).populate("userId", "name email role");

  if (!employee) {
    return res.status(404).json({
      success: false,
      message: "Employee not found",
    });
  }

  res.json({
    success: true,
    employee,
  });
});

// @desc    Create employee
// @route   POST /api/employees
// @access  Private (super_admin, admin)
const createEmployee = asyncHandler(async (req, res) => {
  const { name, email, phone, department, designation, joinDate, employmentStatus, address, userId, notes } = req.body;

  if (!name) {
    return res.status(400).json({
      success: false,
      message: "Name is required",
    });
  }

  const employee = await Employee.create({
    employeeId: generateEmployeeId(),
    name,
    email,
    phone,
    department,
    designation,
    joinDate,
    employmentStatus,
    address,
    userId: userId || undefined,
    notes,
  });

  await ActivityLog.create({
    userId: req.user._id,
    action: "CREATE",
    entity: "Employee",
    entityId: employee._id.toString(),
    metadata: { name, employeeId: employee.employeeId },
    ipAddress: req.ip,
  });

  res.status(201).json({
    success: true,
    employee,
  });
});

// @desc    Update employee
// @route   PUT /api/employees/:id
// @access  Private (super_admin, admin)
const updateEmployee = asyncHandler(async (req, res) => {
  const { name, email, phone, department, designation, joinDate, employmentStatus, address, userId, notes } = req.body;

  const employee = await Employee.findById(req.params.id);

  if (!employee) {
    return res.status(404).json({
      success: false,
      message: "Employee not found",
    });
  }

  if (name) employee.name = name;
  if (email !== undefined) employee.email = email;
  if (phone !== undefined) employee.phone = phone;
  if (department !== undefined) employee.department = department;
  if (designation !== undefined) employee.designation = designation;
  if (joinDate !== undefined) employee.joinDate = joinDate;
  if (employmentStatus) employee.employmentStatus = employmentStatus;
  if (address !== undefined) employee.address = address;
  if (userId !== undefined) employee.userId = userId || undefined;
  if (notes !== undefined) employee.notes = notes;

  await employee.save();

  await ActivityLog.create({
    userId: req.user._id,
    action: "UPDATE",
    entity: "Employee",
    entityId: employee._id.toString(),
    metadata: { name: employee.name },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    employee,
  });
});

// @desc    Delete employee
// @route   DELETE /api/employees/:id
// @access  Private (super_admin)
const deleteEmployee = asyncHandler(async (req, res) => {
  const employee = await Employee.findById(req.params.id);

  if (!employee) {
    return res.status(404).json({
      success: false,
      message: "Employee not found",
    });
  }

  await employee.deleteOne();

  await ActivityLog.create({
    userId: req.user._id,
    action: "DELETE",
    entity: "Employee",
    entityId: employee._id.toString(),
    metadata: { name: employee.name },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: "Employee deleted successfully",
  });
});

module.exports = {
  getEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
};
