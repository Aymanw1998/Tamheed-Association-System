const router = require("express").Router();
const { requireAuth, requireRole } = require("../../middleware/authMiddleware");

const {
    getSheet,
    bulkSave,
    getLessonDates,
} = require("./Attendance.controller");

router.get("/sheet", requireAuth, getSheet);
router.post("/bulk-save", requireAuth, requireRole('ادارة', 'مرشد'), bulkSave);
router.get("/dates", requireAuth, getLessonDates);

module.exports = router;
