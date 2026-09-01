const Server = require("../models/Server");
const Project = require("../models/Project");
const ActivityLog = require("../models/ActivityLog");
const { generateServerId } = require("../utils/generateIds");
const { asyncHandler } = require("../middleware/errorHandler");

// @desc    Get all servers
// @route   GET /api/servers
// @access  Private
const getServers = asyncHandler(async (req, res) => {
  const { status, search, page = 1, limit = 20 } = req.query;
  const query = {};

  if (status) query.status = status;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { serverId: { $regex: search, $options: "i" } },
      { ipAddress: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [servers, total] = await Promise.all([
    Server.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
    Server.countDocuments(query),
  ]);

  res.json({
    success: true,
    count: servers.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    servers,
  });
});

// @desc    Get single server
// @route   GET /api/servers/:id
// @access  Private
const getServer = asyncHandler(async (req, res) => {
  const server = await Server.findById(req.params.id);

  if (!server) {
    return res.status(404).json({
      success: false,
      message: "Server not found",
    });
  }

  res.json({
    success: true,
    server,
  });
});

// @desc    Create server
// @route   POST /api/servers
// @access  Private
const createServer = asyncHandler(async (req, res) => {
  const { name, provider, ipAddress, hostname, sshPort, sshUsername, sshKeyFingerprint, os, ram, storage, notes } = req.body;

  const server = await Server.create({
    serverId: generateServerId(),
    name,
    provider,
    ipAddress,
    hostname,
    sshPort,
    sshUsername,
    sshKeyFingerprint,
    os,
    ram,
    storage,
    notes,
  });

  await ActivityLog.create({
    userId: req.user._id,
    action: "CREATE",
    entity: "Server",
    entityId: server._id.toString(),
    metadata: { name, serverId: server.serverId },
    ipAddress: req.ip,
  });

  res.status(201).json({
    success: true,
    server,
  });
});

// @desc    Update server
// @route   PUT /api/servers/:id
// @access  Private
const updateServer = asyncHandler(async (req, res) => {
  const { name, provider, ipAddress, hostname, sshPort, sshUsername, sshKeyFingerprint, os, ram, storage, status, notes } = req.body;

  const server = await Server.findById(req.params.id);

  if (!server) {
    return res.status(404).json({
      success: false,
      message: "Server not found",
    });
  }

  if (name) server.name = name;
  if (provider !== undefined) server.provider = provider;
  if (ipAddress !== undefined) server.ipAddress = ipAddress;
  if (hostname !== undefined) server.hostname = hostname;
  if (sshPort !== undefined) server.sshPort = sshPort;
  if (sshUsername !== undefined) server.sshUsername = sshUsername;
  if (sshKeyFingerprint !== undefined) server.sshKeyFingerprint = sshKeyFingerprint;
  if (os !== undefined) server.os = os;
  if (ram !== undefined) server.ram = ram;
  if (storage !== undefined) server.storage = storage;
  if (status) server.status = status;
  if (notes !== undefined) server.notes = notes;

  await server.save();

  await ActivityLog.create({
    userId: req.user._id,
    action: "UPDATE",
    entity: "Server",
    entityId: server._id.toString(),
    metadata: { name },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    server,
  });
});

// @desc    Delete server
// @route   DELETE /api/servers/:id
// @access  Private
const deleteServer = asyncHandler(async (req, res) => {
  const server = await Server.findById(req.params.id);

  if (!server) {
    return res.status(404).json({
      success: false,
      message: "Server not found",
    });
  }

  const projectsUsingServer = await Project.countDocuments({ serverId: server._id });
  if (projectsUsingServer > 0) {
    return res.status(400).json({
      success: false,
      message: `Cannot delete server: ${projectsUsingServer} project(s) are using this server. Please remove or reassign those projects first.`,
    });
  }

  await server.deleteOne();

  await ActivityLog.create({
    userId: req.user._id,
    action: "DELETE",
    entity: "Server",
    entityId: server._id.toString(),
    metadata: { name: server.name },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: "Server deleted successfully",
  });
});

module.exports = {
  getServers,
  getServer,
  createServer,
  updateServer,
  deleteServer,
};
