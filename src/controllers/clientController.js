const Client = require("../models/Client");
const Project = require("../models/Project");
const Subscription = require("../models/Subscription");
const Payment = require("../models/Payment");
const ActivityLog = require("../models/ActivityLog");
const { generateClientId } = require("../utils/generateIds");
const { asyncHandler } = require("../middleware/errorHandler");

// @desc    Get all clients
// @route   GET /api/clients
// @access  Private
const getClients = asyncHandler(async (req, res) => {
  const { status, search, page = 1, limit = 20 } = req.query;
  const query = {};

  if (status) query.status = status;
  if (search) {
    query.$or = [
      { companyName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { clientId: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [clients, total] = await Promise.all([
    Client.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Client.countDocuments(query),
  ]);

  res.json({
    success: true,
    count: clients.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    clients,
  });
});

// @desc    Get single client
// @route   GET /api/clients/:id
// @access  Private
const getClient = asyncHandler(async (req, res) => {
  const client = await Client.findById(req.params.id);

  if (!client) {
    return res.status(404).json({
      success: false,
      message: "Client not found",
    });
  }

  // Get related data
  const [projects, subscriptions, payments] = await Promise.all([
    Project.find({ clientId: client._id }).sort({ createdAt: -1 }),
    Subscription.find({ clientId: client._id }).sort({ createdAt: -1 }),
    Payment.find({ clientId: client._id }).sort({ createdAt: -1 }),
  ]);

  res.json({
    success: true,
    client,
    projects,
    subscriptions,
    payments,
  });
});

// @desc    Create client
// @route   POST /api/clients
// @access  Private
const createClient = asyncHandler(async (req, res) => {
  const {
    companyName,
    contactPerson,
    email,
    phone,
    address,
    city,
    state,
    country,
    gstNumber,
    notes,
  } = req.body;

  const client = await Client.create({
    clientId: generateClientId(),
    companyName,
    contactPerson,
    email: email.toLowerCase(),
    phone,
    address,
    city,
    state,
    country: country || "India",
    gstNumber,
    notes,
  });

  await ActivityLog.create({
    userId: req.user._id,
    action: "CREATE",
    entity: "Client",
    entityId: client._id.toString(),
    metadata: { companyName, clientId: client.clientId },
    ipAddress: req.ip,
  });

  res.status(201).json({
    success: true,
    client,
  });
});

// @desc    Update client
// @route   PUT /api/clients/:id
// @access  Private
const updateClient = asyncHandler(async (req, res) => {
  const {
    companyName,
    contactPerson,
    email,
    phone,
    address,
    city,
    state,
    country,
    gstNumber,
    status,
    notes,
  } = req.body;

  const client = await Client.findById(req.params.id);

  if (!client) {
    return res.status(404).json({
      success: false,
      message: "Client not found",
    });
  }

  if (companyName) client.companyName = companyName;
  if (contactPerson) client.contactPerson = contactPerson;
  if (email) client.email = email.toLowerCase();
  if (phone) client.phone = phone;
  if (address) client.address = address;
  if (city) client.city = city;
  if (state) client.state = state;
  if (country) client.country = country;
  if (gstNumber) client.gstNumber = gstNumber;
  if (status) client.status = status;
  if (notes !== undefined) client.notes = notes;

  await client.save();

  await ActivityLog.create({
    userId: req.user._id,
    action: "UPDATE",
    entity: "Client",
    entityId: client._id.toString(),
    metadata: { companyName, status },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    client,
  });
});

// @desc    Delete client
// @route   DELETE /api/clients/:id
// @access  Private
const deleteClient = asyncHandler(async (req, res) => {
  const client = await Client.findById(req.params.id);

  if (!client) {
    return res.status(404).json({
      success: false,
      message: "Client not found",
    });
  }

  // Also delete related data
  const projectIds = await Project.find({ clientId: client._id }).distinct("_id");
  await Subscription.deleteMany({ clientId: client._id });
  await Payment.deleteMany({ clientId: client._id });
  await Project.deleteMany({ clientId: client._id });

  // Hard delete
  await client.deleteOne();

  await ActivityLog.create({
    userId: req.user._id,
    action: "DELETE",
    entity: "Client",
    entityId: client._id.toString(),
    metadata: { companyName: client.companyName },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: "Client deleted successfully",
  });
});

// @desc    Get client statistics
// @route   GET /api/clients/stats
// @access  Private
const getClientStats = asyncHandler(async (req, res) => {
  const [total, active, inactive, suspended] = await Promise.all([
    Client.countDocuments(),
    Client.countDocuments({ status: "active" }),
    Client.countDocuments({ status: "inactive" }),
    Client.countDocuments({ status: "suspended" }),
  ]);

  res.json({
    success: true,
    stats: { total, active, inactive, suspended },
  });
});

module.exports = {
  getClients,
  getClient,
  createClient,
  updateClient,
  deleteClient,
  getClientStats,
};
