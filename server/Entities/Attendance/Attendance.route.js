const router = require("express").Router();
const { requireAuth } = require("../../middleware/authMiddleware");
const { loadActor, requirePermission } = require("../../middleware/permissionMiddleware");

const {
    getSheet,
    bulkSave,
    getLessonDates,
} = require("./Attendance.controller");

router.use(requireAuth, loadActor);

router.get("/sheet", requirePermission("attendance.view"), getSheet);
router.post("/bulk-save", requirePermission("attendance.record"), bulkSave);
router.get("/dates", requirePermission("attendance.view"), getLessonDates);

module.exports = router;
