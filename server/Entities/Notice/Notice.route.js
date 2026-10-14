const express = require("express");
const controller = require("./Notice.controller");
const { requireAuth } = require("../../middleware/authMiddleware");
const { rateLimit } = require("../../middleware/rateLimit");

const router = express.Router();
const checkRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, scope: "notice-run-check" });

// Administrators only; the role is checked against the database on every call.
router.use(requireAuth, controller.requireAdmin);

router.get("/", controller.list);
router.get("/unread-count", controller.unreadCount);
router.post("/", controller.create);
router.post("/read-all", controller.readAll);
router.post("/run-vehicle-check", checkRateLimit, controller.runVehicleCheck);
router.post("/:id/read", controller.read);
router.post("/:id/archive", controller.archive);

module.exports = router;
