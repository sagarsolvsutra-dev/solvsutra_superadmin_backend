const Project = require("../models/Project");
const Client = require("../models/Client");
const Subscription = require("../models/Subscription");
const ActivityLog = require("../models/ActivityLog");
const { generateProjectId, generateApiKey, generateApiSecret } = require("../utils/generateIds");
const { asyncHandler } = require("../middleware/errorHandler");

// @desc    Get all projects
// @route   GET /api/projects
// @access  Private
const getProjects = asyncHandler(async (req, res) => {
  const { clientId, status, environment, search, page = 1, limit = 20 } = req.query;
  const query = {};

  if (clientId) query.clientId = clientId;
  if (status) query.status = status;
  if (environment) query.environment = environment;
  if (search) {
    query.$or = [
      { projectName: { $regex: search, $options: "i" } },
      { projectId: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [projects, total] = await Promise.all([
    Project.find(query)
      .populate("clientId", "companyName clientId email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Project.countDocuments(query),
  ]);

  res.json({
    success: true,
    count: projects.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    projects,
  });
});

// @desc    Get single project
// @route   GET /api/projects/:id
// @access  Private
const getProject = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id).populate(
    "clientId",
    "companyName clientId email phone"
  );

  if (!project) {
    return res.status(404).json({
      success: false,
      message: "Project not found",
    });
  }

  const subscription = await Subscription.findOne({
    projectId: project._id,
  }).populate("planId", "name price duration durationUnit");

  res.json({
    success: true,
    project,
    subscription,
  });
});

// @desc    Create project
// @route   POST /api/projects
// @access  Private
const createProject = asyncHandler(async (req, res) => {
  const {
    clientId,
    projectName,
    description,
    frontendUrl,
    adminUrl,
    backendUrl,
    repositoryUrl,
    environment,
    techStack,
    domain,
  } = req.body;

  // Verify client exists
  const client = await Client.findById(clientId);
  if (!client) {
    return res.status(404).json({
      success: false,
      message: "Client not found",
    });
  }

  const project = await Project.create({
    projectId: generateProjectId(),
    clientId,
    projectName,
    description,
    frontendUrl,
    adminUrl,
    backendUrl,
    repositoryUrl,
    environment: environment || "production",
    apiKey: generateApiKey(),
    apiSecret: generateApiSecret(),
    techStack,
    domain,
  });

  await ActivityLog.create({
    userId: req.user._id,
    action: "CREATE",
    entity: "Project",
    entityId: project._id.toString(),
    metadata: { projectName, projectId: project.projectId, clientId },
    ipAddress: req.ip,
  });

  res.status(201).json({
    success: true,
    project,
  });
});

// @desc    Update project
// @route   PUT /api/projects/:id
// @access  Private
const updateProject = asyncHandler(async (req, res) => {
  const {
    projectName,
    description,
    frontendUrl,
    adminUrl,
    backendUrl,
    repositoryUrl,
    environment,
    status,
    techStack,
    domain,
    serverId,
  } = req.body;

  const project = await Project.findById(req.params.id);

  if (!project) {
    return res.status(404).json({
      success: false,
      message: "Project not found",
    });
  }

  if (projectName) project.projectName = projectName;
  if (description !== undefined) project.description = description;
  if (frontendUrl !== undefined) project.frontendUrl = frontendUrl;
  if (adminUrl !== undefined) project.adminUrl = adminUrl;
  if (backendUrl !== undefined) project.backendUrl = backendUrl;
  if (repositoryUrl !== undefined) project.repositoryUrl = repositoryUrl;
  if (environment) project.environment = environment;
  if (status) project.status = status;
  if (techStack !== undefined) project.techStack = techStack;
  if (domain !== undefined) project.domain = domain;
  if (serverId !== undefined) project.serverId = serverId;

  await project.save();

  await ActivityLog.create({
    userId: req.user._id,
    action: "UPDATE",
    entity: "Project",
    entityId: project._id.toString(),
    metadata: { projectName, status },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    project,
  });
});

// @desc    Delete project
// @route   DELETE /api/projects/:id
// @access  Private
const deleteProject = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);

  if (!project) {
    return res.status(404).json({
      success: false,
      message: "Project not found",
    });
  }

  project.status = "inactive";
  await project.save();

  await ActivityLog.create({
    userId: req.user._id,
    action: "DELETE",
    entity: "Project",
    entityId: project._id.toString(),
    metadata: { projectName: project.projectName },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: "Project deactivated",
  });
});

// @desc    Get project by Project ID (for client projects)
// @route   GET /api/projects/project-id/:projectId
// @access  Public (with API key)
const getProjectByProjectId = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ projectId: req.params.projectId }).populate(
    "clientId",
    "companyName clientId email"
  );

  if (!project) {
    return res.status(404).json({
      success: false,
      message: "Project not found",
    });
  }

  res.json({
    success: true,
    project,
  });
});

// @desc    Regenerate project credentials
// @route   POST /api/projects/:id/regenerate-credentials
// @access  Private
const regenerateCredentials = asyncHandler(async (req, res) => {
  const project = await Project.findById(req.params.id);

  if (!project) {
    return res.status(404).json({
      success: false,
      message: "Project not found",
    });
  }

  project.apiKey = generateApiKey();
  project.apiSecret = generateApiSecret();
  await project.save();

  await ActivityLog.create({
    userId: req.user._id,
    action: "REGENERATE_CREDENTIALS",
    entity: "Project",
    entityId: project._id.toString(),
    metadata: { projectName: project.projectName },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    project,
  });
});

// @desc    Get project statistics
// @route   GET /api/projects/stats
// @access  Private
const getProjectStats = asyncHandler(async (req, res) => {
  const [total, active, inactive, suspended] = await Promise.all([
    Project.countDocuments(),
    Project.countDocuments({ status: "active" }),
    Project.countDocuments({ status: "inactive" }),
    Project.countDocuments({ status: "suspended" }),
  ]);

  res.json({
    success: true,
    stats: { total, active, inactive, suspended },
  });
});

module.exports = {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  getProjectByProjectId,
  regenerateCredentials,
  getProjectStats,
};
