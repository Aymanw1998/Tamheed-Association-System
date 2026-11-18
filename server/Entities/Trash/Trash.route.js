const express = require("express");
const controller = require("./Trash.controller");
const { requireAuth } = require("../../middleware/authMiddleware");
const { loadActor, requirePermission } = require("../../middleware/permissionMiddleware");

// «سلة المحذوفات» (owner, 2026-11-16). Any one of the delete keys opens it;
// the controller shows and acts only on the kinds whose key the actor holds.
const router = express.Router();
router.use(requireAuth, loadActor);

const ANY_DELETE = ["students.delete", "vehicles.delete", "users.delete"];
router.get("/", requirePermission(...ANY_DELETE), controller.list);
router.post("/:id/restore", requirePermission(...ANY_DELETE), controller.restore);
// Deleting for good needs the kind's purge key too (checked in the controller).
router.delete("/:id", requirePermission("students.purge", "vehicles.purge", "users.purge"), controller.purge);

module.exports = router;
