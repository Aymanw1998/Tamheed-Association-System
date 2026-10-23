const express = require("express");
const controller = require("./Sport.controller");
const { requireAuth } = require("../../middleware/authMiddleware");
const { loadActor, requirePermission } = require("../../middleware/permissionMiddleware");

const router = express.Router();
// Coach routes admit sports.coach; the controller then checks the actor coaches that team.

router.use(requireAuth, loadActor);

router.get("/", requirePermission("sports.view"), controller.listSports);
router.post("/", requirePermission("sports.manage"), controller.createSport);
router.get("/coaches", requirePermission("sports.view"), controller.listCoaches);
router.get("/teams", requirePermission("sports.view"), controller.listTeams);
router.post("/teams", requirePermission("sports.manage"), controller.createTeam);
router.get("/players", requirePermission("sports.view"), controller.listPlayers);
router.get("/students/search", requirePermission("sports.coach", "sports.manage"), controller.searchStudents);
router.put("/players/:studentId/:sportId", requirePermission("sports.coach", "sports.manage"), controller.setPlayer);
router.delete("/players/:studentId/:sportId", requirePermission("sports.coach", "sports.manage"), controller.deletePlayer);
router.put("/teams/:id", requirePermission("sports.manage"), controller.updateTeam);
router.delete("/teams/:id", requirePermission("sports.manage"), controller.deleteTeam);
router.put("/teams/:id/members", requirePermission("sports.coach", "sports.manage"), controller.setMembers);
router.get("/teams/:id/trainings", requirePermission("sports.view"), controller.listTrainings);
router.post("/teams/:id/trainings", requirePermission("sports.coach", "sports.manage"), controller.createTraining);
router.put("/trainings/:id", requirePermission("sports.coach", "sports.manage"), controller.updateTraining);
router.delete("/trainings/:id", requirePermission("sports.coach", "sports.manage"), controller.deleteTraining);
// Declared last: "/:id" would otherwise swallow the fixed paths above.
router.put("/:id", requirePermission("sports.manage"), controller.updateSport);
router.delete("/:id", requirePermission("sports.manage"), controller.deleteSport);

module.exports = router;
