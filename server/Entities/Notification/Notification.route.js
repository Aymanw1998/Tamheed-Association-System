const express = require("express");
const router = express.Router();

const { getAll, markRead, markAllRead } = require("./Notification.controller");

// لازم يكون عندك middleware authRequired يعبّي req.user
const { requireAuth } = require("../../middleware/authMiddleware"); // عدّل المسار حسب مشروعك

router.get("/", requireAuth, getAll);
router.put("/read-all", requireAuth, markAllRead);
router.put("/:id/read", requireAuth, markRead);

module.exports = router;
