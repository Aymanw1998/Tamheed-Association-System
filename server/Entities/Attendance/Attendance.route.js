const router = require("express").Router();
const { requireAuth } = require("../../middleware/authMiddleware");
const { loadActor, requirePermission } = require("../../middleware/permissionMiddleware");
const { requireFreeOrMine } = require("../../middleware/lockGuard");

// One sheet = one lesson on one date: attendance:<lessonId>:<YYYY-MM-DD>.
// An unreadable lesson or date has no key; the controller answers 400.
const pad2 = (n) => String(n).padStart(2, "0");
const sheetKey = (req) => {
    const { lessonId, year, month, day } = req.body || {};
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    if (!lessonId || !y || !m || !d) return null;
    return `attendance:${lessonId}:${y}-${pad2(m)}-${pad2(d)}`;
};
const lockedSheet = requireFreeOrMine(sheetKey);

const {
    getSheet,
    bulkSave,
    getLessonDates,
} = require("./Attendance.controller");

router.use(requireAuth, loadActor);

router.get("/sheet", requirePermission("attendance.view"), getSheet);
router.post("/bulk-save", requirePermission("attendance.record"), lockedSheet, bulkSave);
router.get("/dates", requirePermission("attendance.view"), getLessonDates);

module.exports = router;
