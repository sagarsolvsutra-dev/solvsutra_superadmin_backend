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
const { protect, authorize, verifyProjectApi } = require("../middleware/auth");

router.get("/stats", protect, getProjectStats);
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

module.exports = router;
