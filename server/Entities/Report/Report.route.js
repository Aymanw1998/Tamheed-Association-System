const express = require('express');
const { getAll, getById, post, put, remove} = require("./Report.controller.js");
const { requireAuth } = require("../../middleware/authMiddleware.js");
const { loadActor, requirePermission } = require("../../middleware/permissionMiddleware.js");
const router = express.Router();

router.use(requireAuth, loadActor);

// Reads are filtered per caller in the controller (reports.viewAll).
router.get("/", getAll);
router.get("/:id", getById);
router.post("/", requirePermission("reports.create"), post);
router.put("/:id", requirePermission("reports.editOwn", "reports.editAll"), put);
router.delete("/:id", requirePermission("reports.delete"), remove);

module.exports = router;
