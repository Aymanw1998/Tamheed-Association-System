const express = require('express');
const { getAll, getById, post, put, remove} = require("./Report.controller.js");
const { ReportModelDef } = require("./Report.model.js");
const { requireAuth } = require("../../middleware/authMiddleware.js");
const { loadActor, requirePermission } = require("../../middleware/permissionMiddleware.js");
const { requireFreeOrMine } = require("../../middleware/lockGuard.js");
const { can } = require("../../utils/permissions.js");
const router = express.Router();

// An edit learns who holds the report only if the caller may edit it: for an
// editOwn-only caller someone else's report has no key here, so the controller
// answers 403 and the holder's name and ID number are never sent.
const editKey = async (req) => {
  const id = String(req.params.id ?? "").trim();
  if (can(req.actor?.permissions, "reports.editAll")) return `report:${id}`;
  const found = await ReportModelDef.get({ _id: id }).catch(() => null);
  const createdBy = String(found?.result?.[0]?.createdBy ?? "").trim();
  const mine = Boolean(createdBy) && [req.user?.id, req.user?.tz].some((ref) => createdBy === String(ref ?? "").trim());
  return mine ? `report:${id}` : null;
};
const lockedForEdit = requireFreeOrMine(editKey);
// reports.delete covers every report.
const lockedReport = requireFreeOrMine((req) => `report:${req.params.id}`);

router.use(requireAuth, loadActor);

// Reads are filtered per caller in the controller (reports.viewAll).
router.get("/", getAll);
router.get("/:id", getById);
router.post("/", requirePermission("reports.create"), post);
router.put("/:id", requirePermission("reports.editOwn", "reports.editAll"), lockedForEdit, put);
router.delete("/:id", requirePermission("reports.delete"), lockedReport, remove);

module.exports = router;
