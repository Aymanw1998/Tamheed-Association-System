const express = require('express');
const { getAll, getById, post, put, remove} = require("./Report.controller.js");
const { requireAuth } = require("../../middleware/authMiddleware.js");
const { loadActor, requirePermission } = require("../../middleware/permissionMiddleware.js");
const { requireFreeOrMine } = require("../../middleware/lockGuard.js");
const router = express.Router();

const lockedReport = requireFreeOrMine((req) => `report:${req.params.id}`);

router.use(requireAuth, loadActor);

// Reads are filtered per caller in the controller (reports.viewAll).
router.get("/", getAll);
router.get("/:id", getById);
router.post("/", requirePermission("reports.create"), post);
router.put("/:id", requirePermission("reports.editOwn", "reports.editAll"), lockedReport, put);
router.delete("/:id", requirePermission("reports.delete"), lockedReport, remove);

module.exports = router;
