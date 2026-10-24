const express = require("express");
const controller = require("./Sport.controller");
const { requireAuth } = require("../../middleware/authMiddleware");
const { loadActor, requirePermission } = require("../../middleware/permissionMiddleware");

const router = express.Router();

router.use(requireAuth, loadActor);

// read = view, coach or manage; coach = coach or manage; manage = manage only.
router.get("/", requirePermission("sports.view", "sports.coach", "sports.manage"), controller.getSport);
router.put("/stats", requirePermission("sports.manage"), controller.setStats);
router.get("/players", requirePermission("sports.view", "sports.coach", "sports.manage"), controller.listPlayers);
router.get("/students/search", requirePermission("sports.coach", "sports.manage"), controller.searchStudents);
router.put("/players/:studentId", requirePermission("sports.coach", "sports.manage"), controller.savePlayer);
router.delete("/players/:studentId", requirePermission("sports.coach", "sports.manage"), controller.deletePlayer);
router.post("/players/:studentId/stats", requirePermission("sports.coach", "sports.manage"), controller.bumpStat);

module.exports = router;
