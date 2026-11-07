const express = require("express");
const controller = require("./Notice.controller");
const { requireAuth } = require("../../middleware/authMiddleware");
const { loadActor, requirePermission } = require("../../middleware/permissionMiddleware");
const { rateLimit } = require("../../middleware/rateLimit");

const router = express.Router();
const checkRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, scope: "notice-run-check" });

// loadActor re-reads the user's permissions from the database on every call.
router.use(requireAuth, loadActor);

router.get("/", requirePermission("notices.view"), controller.list);
router.get("/unread-count", requirePermission("notices.view"), controller.unreadCount);
router.post("/", requirePermission("notices.post"), controller.create);
router.post("/read-all", requirePermission("notices.view"), controller.readAll);
router.post("/run-vehicle-check", requirePermission("notices.runCheck"), checkRateLimit, controller.runVehicleCheck);
router.post("/:id/read", requirePermission("notices.view"), controller.read);
// Archiving removes a notice from everyone's board: independently revocable.
router.post("/:id/archive", requirePermission("notices.archive"), controller.archive);
router.post("/:id/delete", requirePermission("notices.view"), requirePermission("notices.delete"), controller.trash);
router.post("/:id/restore", requirePermission("notices.view"), requirePermission("notices.restore"), controller.restore);
router.post("/:id/hide", requirePermission("notices.view"), requirePermission("alerts.dismiss"), controller.hide);
router.post("/:id/unhide", requirePermission("notices.view"), requirePermission("alerts.dismiss"), controller.unhide);

module.exports = router;
