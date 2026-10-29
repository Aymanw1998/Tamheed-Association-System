const express = require("express");
const controller = require("./Sport.controller");
const { requireAuth } = require("../../middleware/authMiddleware");
const { loadActor, requirePermission } = require("../../middleware/permissionMiddleware");

const { requireFreeOrMine } = require("../../middleware/lockGuard");

// Lock keys: a player by student id, a sport lesson (its form and roster) by
// lesson id, a sport attendance sheet by lesson id and date.
const lockedPlayer = requireFreeOrMine((req) => (req.params.studentId ? `player:${req.params.studentId}` : null));
const lockedLesson = requireFreeOrMine((req) => (req.params.id ? `sportLesson:${req.params.id}` : null));
const lockedSheet = requireFreeOrMine((req) => {
  const date = String(req.body?.date ?? "").trim();
  return req.params.id && date ? `sportAttendance:${req.params.id}:${date}` : null;
});

const router = express.Router();

router.use(requireAuth, loadActor);

// read = view, coach or manage; coach = coach or manage; manage = manage only.
router.get("/", requirePermission("sports.view", "sports.coach", "sports.manage"), controller.getSport);
router.put("/stats", requirePermission("sports.manage"), controller.setStats);
router.get("/players", requirePermission("sports.view", "sports.coach", "sports.manage"), controller.listPlayers);
router.get("/students/search", requirePermission("sports.coach", "sports.manage"), controller.searchStudents);
router.get("/players/:studentId/photo", requirePermission("sports.view", "sports.coach", "sports.manage"), controller.playerPhoto);
router.put("/players/:studentId", requirePermission("sports.coach", "sports.manage"), lockedPlayer, controller.savePlayer);
router.delete("/players/:studentId", requirePermission("sports.coach", "sports.manage"), lockedPlayer, controller.deletePlayer);
router.post("/players/:studentId/stats", requirePermission("sports.coach", "sports.manage"), lockedPlayer, controller.bumpStat);
router.get("/lessons", requirePermission("sports.view", "sports.coach", "sports.manage"), controller.listLessons);
router.post("/lessons", requirePermission("sports.manage"), controller.createLesson);
router.put("/lessons/:id", requirePermission("sports.manage"), lockedLesson, controller.updateLesson);
router.delete("/lessons/:id", requirePermission("sports.manage"), lockedLesson, controller.deleteLesson);
router.post("/lessons/:id/players", requirePermission("sports.coach", "sports.manage"), lockedLesson, controller.addLessonPlayer);
router.delete("/lessons/:id/players/:studentId", requirePermission("sports.coach", "sports.manage"), lockedLesson, controller.removeLessonPlayer);
router.get("/lessons/:id/attendance", requirePermission("sports.view", "sports.coach", "sports.manage"), controller.getAttendance);
router.put("/lessons/:id/attendance", requirePermission("sports.coach", "sports.manage"), lockedSheet, controller.saveAttendance);
router.get("/attendance/today", requirePermission("sports.view", "sports.coach", "sports.manage"), controller.todayLessons);

module.exports = router;
