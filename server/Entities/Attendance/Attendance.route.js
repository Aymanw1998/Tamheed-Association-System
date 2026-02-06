const router = require("express").Router();
const { requireAuth } = require("../../middleware/authMiddleware");

const {
    getSheet,
    bulkSave,
    getLessonDates,
} = require("./Attendance.controller");

router.get("/sheet", requireAuth, getSheet);
router.post("/bulk-save", requireAuth, bulkSave);
router.get("/dates", requireAuth, getLessonDates);

module.exports = router;
