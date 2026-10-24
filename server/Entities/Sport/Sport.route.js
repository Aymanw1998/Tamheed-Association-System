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
router.get("/lessons", requirePermission("sports.view", "sports.coach", "sports.manage"), controller.listLessons);
router.post("/lessons", requirePermission("sports.manage"), controller.createLesson);
router.put("/lessons/:id", requirePermission("sports.manage"), controller.updateLesson);
router.delete("/lessons/:id", requirePermission("sports.manage"), controller.deleteLesson);
router.post("/lessons/:id/players", requirePermission("sports.coach", "sports.manage"), controller.addLessonPlayer);
router.delete("/lessons/:id/players/:studentId", requirePermission("sports.coach", "sports.manage"), controller.removeLessonPlayer);
router.get("/lessons/:id/attendance", requirePermission("sports.view", "sports.coach", "sports.manage"), controller.getAttendance);
router.put("/lessons/:id/attendance", requirePermission("sports.coach", "sports.manage"), controller.saveAttendance);
router.get("/attendance/today", requirePermission("sports.view", "sports.coach", "sports.manage"), controller.todayLessons);

module.exports = router;
