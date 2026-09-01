const express = require("express");
const router = express.Router();
const {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  getProjectByProjectId,
  regenerateCredentials,
  getProjectStats,
} = require("../controllers/projectController");
const {
  getProjectStaff,
  assignStaff,
  updateAssignment,
  removeAssignment,
  getStaffSummary,
  getUserProjects,
  getMilestones,
  createMilestone,
  updateMilestone,
  deleteMilestone,
} = require("../controllers/projectTeamController");
const { protect, authorize, verifyProjectApi } = require("../middleware/auth");

// --- static paths first, so they aren't swallowed by /:id ---
router.get("/stats", protect, getProjectStats);
router.get("/staff-summary", protect, getStaffSummary);
router.get("/staff/:userId/projects", protect, getUserProjects);
router.get("/project-id/:projectId", verifyProjectApi, getProjectByProjectId);

router
  .route("/")
  .get(protect, getProjects)
  .post(protect, authorize("super_admin", "admin"), createProject);

router
  .route("/:id")
  .get(protect, getProject)
  .put(protect, updateProject)
  .delete(protect, authorize("super_admin"), deleteProject);

router.post(
  "/:id/regenerate-credentials",
  protect,
  authorize("super_admin"),
  regenerateCredentials
);

// --- staff assignments ---
router
  .route("/:id/staff")
  .get(protect, getProjectStaff)
  .post(protect, authorize("super_admin", "admin"), assignStaff);

router
  .route("/:id/staff/:assignmentId")
  .put(protect, authorize("super_admin", "admin"), updateAssignment)
  .delete(protect, authorize("super_admin", "admin"), removeAssignment);

// --- timeline / milestones ---
router
  .route("/:id/milestones")
  .get(protect, getMilestones)
  .post(protect, authorize("super_admin", "admin", "developer"), createMilestone);

router
  .route("/:id/milestones/:milestoneId")
  .put(protect, authorize("super_admin", "admin", "developer"), updateMilestone)
  .delete(protect, authorize("super_admin", "admin"), deleteMilestone);

module.exports = router;
