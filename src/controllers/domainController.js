const Domain = require("../models/Domain");
const Project = require("../models/Project");
const ActivityLog = require("../models/ActivityLog");
const { generateDomainId } = require("../utils/generateIds");
const { asyncHandler } = require("../middleware/errorHandler");

// @desc    Get all domains
// @route   GET /api/domains
// @access  Private
const getDomains = asyncHandler(async (req, res) => {
  const { projectId, status, type, search, page = 1, limit = 20 } = req.query;
  const query = {};

  if (projectId) query.projectId = projectId;
  if (status) query.status = status;
  if (type) query.type = type;
  if (search) {
    query.$or = [
      { domain: { $regex: search, $options: "i" } },
      { domainId: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [domains, total] = await Promise.all([
    Domain.find(query)
      .populate("projectId", "projectName projectId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Domain.countDocuments(query),
  ]);

  res.json({
    success: true,
    count: domains.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parseInt(limit)),
    domains,
  });
});

// @desc    Get single domain
// @route   GET /api/domains/:id
// @access  Private
const getDomain = asyncHandler(async (req, res) => {
  const domain = await Domain.findById(req.params.id).populate(
    "projectId",
    "projectName projectId"
  );

  if (!domain) {
    return res.status(404).json({
      success: false,
      message: "Domain not found",
    });
  }

  res.json({
    success: true,
    domain,
  });
});

// @desc    Create domain
// @route   POST /api/domains
// @access  Private
const createDomain = asyncHandler(async (req, res) => {
  const { projectId, domain, type, sslEnabled, provider, dnsProvider, nameservers, notes } = req.body;

  // Convert empty string projectId to undefined
  const validProjectId = projectId && projectId !== "" ? projectId : undefined;

  if (validProjectId) {
    const project = await Project.findById(validProjectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }
  }

  const domainRecord = await Domain.create({
    domainId: generateDomainId(),
    projectId: validProjectId,
    domain,
    type: type || "main",
    sslEnabled: sslEnabled !== false,
    provider,
    dnsProvider,
    nameservers: nameservers || [],
    notes,
  });

  await ActivityLog.create({
    userId: req.user._id,
    action: "CREATE",
    entity: "Domain",
    entityId: domainRecord._id.toString(),
    metadata: { domain, projectId },
    ipAddress: req.ip,
  });

  res.status(201).json({
    success: true,
    domain: domainRecord,
  });
});

// @desc    Update domain
// @route   PUT /api/domains/:id
// @access  Private
const updateDomain = asyncHandler(async (req, res) => {
  const { domain, type, sslEnabled, sslExpiry, provider, dnsProvider, nameservers, status, notes } = req.body;

  const domainRecord = await Domain.findById(req.params.id);

  if (!domainRecord) {
    return res.status(404).json({
      success: false,
      message: "Domain not found",
    });
  }

  if (domain !== undefined) domainRecord.domain = domain;
  if (type !== undefined) domainRecord.type = type;
  if (sslEnabled !== undefined) domainRecord.sslEnabled = sslEnabled;
  if (sslExpiry !== undefined) domainRecord.sslExpiry = sslExpiry;
  if (provider !== undefined) domainRecord.provider = provider;
  if (dnsProvider !== undefined) domainRecord.dnsProvider = dnsProvider;
  if (nameservers !== undefined) domainRecord.nameservers = nameservers;
  if (status !== undefined) domainRecord.status = status;
  if (notes !== undefined) domainRecord.notes = notes;

  await domainRecord.save();

  await ActivityLog.create({
    userId: req.user._id,
    action: "UPDATE",
    entity: "Domain",
    entityId: domainRecord._id.toString(),
    metadata: { domain },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    domain: domainRecord,
  });
});

// @desc    Delete domain
// @route   DELETE /api/domains/:id
// @access  Private
const deleteDomain = asyncHandler(async (req, res) => {
  const domainRecord = await Domain.findById(req.params.id);

  if (!domainRecord) {
    return res.status(404).json({
      success: false,
      message: "Domain not found",
    });
  }

  await domainRecord.deleteOne();

  await ActivityLog.create({
    userId: req.user._id,
    action: "DELETE",
    entity: "Domain",
    entityId: domainRecord._id.toString(),
    metadata: { domain: domainRecord.domain },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    message: "Domain deleted",
  });
});

module.exports = {
  getDomains,
  getDomain,
  createDomain,
  updateDomain,
  deleteDomain,
};
