const express = require("express");
const { requireAuth } = require("../../middleware/authMiddleware");
const { loadActor, requirePermission } = require("../../middleware/permissionMiddleware");
const { defaultController } = require("./Export.controller");

// Excel exports (owner, 2026-11-16): managers only, each written in the audit
// log. The controller checks the exact key per kind (see KINDS there).
const router = express.Router();
router.use(requireAuth, loadActor);
const controller = defaultController();

router.post("/log", requirePermission("students.viewAll", "users.view"), controller.log);

module.exports = router;
