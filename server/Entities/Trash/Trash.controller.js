// «سلة المحذوفات» (owner, 2026-11-16): what the actor may see, restore or
// delete for good. Each kind needs its own delete key; deleting for good also
// needs the kind's purge key (owner, 2026-11-18).
const { recycleBin: defaultBin, KINDS } = require("../../services/recycleBin");
const { audit: defaultAudit } = require("../../utils/audit");
const { can } = require("../../utils/permissions");
const { logWithSource } = require("../../middleware/logger");

const KEY_OF = { student: "students.delete", vehicle: "vehicles.delete", user: "users.delete", nasheed: "nasheeds.manage" };
const PURGE_KEY_OF = { student: "students.purge", vehicle: "vehicles.purge", user: "users.purge", nasheed: "nasheeds.manage" };
const MODULE_OF = { student: "students", vehicle: "vehicles", user: "users", nasheed: "nasheeds" };
const NOT_FOUND = { ok: false, code: "NOT_FOUND", message: "العنصر غير موجود في سلة المحذوفات" };

const HOOKS = {
  student: () => require("../Student/Student.controller").trashHooks,
  vehicle: () => require("../Vehicle/Vehicle.controller").trashHooks,
  user: () => require("../User/User.controller").trashHooks,
  nasheed: () => require("../../services/nasheeds").nasheedLibrary().trashHooks,
};

function createTrashController({ bin = defaultBin, audit = defaultAudit, hooks = HOOKS } = {}) {
  const allowedKinds = (req) => KINDS.filter((kind) => can(req.actor?.permissions, KEY_OF[kind]));
  const mayPurge = (req, kind) => can(req.actor?.permissions, PURGE_KEY_OF[kind]);
  // A kind may hide some rows (users: the system account, IT users; students:
  // those outside the actor's students). The hook may be async.
  const visible = async (entry, req) => {
    const own = typeof hooks[entry.kind] === "function" ? hooks[entry.kind]() : hooks[entry.kind];
    return typeof own?.visible === "function" ? Boolean(await own.visible(entry, req)) : true;
  };
  const toClient = (req) => (entry) => ({
    id: String(entry._id),
    kind: entry.kind,
    label: entry.label,
    deletedAt: entry.deletedAt,
    deletedBy: entry.deletedBy?.name || entry.deletedBy?.tz || "",
    expiresAt: bin.expiresAt(entry),
    canPurge: mayPurge(req, entry.kind),
  });
  // The row, when this actor may act on it; null otherwise (answered as 404).
  const findFor = async (req) => {
    const entry = await bin.get(req.params.id);
    if (!entry || !allowedKinds(req).includes(entry.kind) || !(await visible(entry, req))) return null;
    return entry;
  };
  const record = (req, entry, action) => audit.record(req, {
    module: MODULE_OF[entry.kind], action, targetType: entry.kind,
    targetId: entry.kind === "user" ? entry.data?.tz : entry.refId, targetLabel: entry.label,
  });

  const list = async (req, res) => {
    try {
      const kinds = allowedKinds(req);
      const rows = await bin.list(kinds);
      const shown = await Promise.all(rows.map((entry) => visible(entry, req)));
      const items = rows.filter((_, i) => shown[i]).map(toClient(req));
      return res.status(200).json({ ok: true, items });
    } catch (err) {
      logWithSource("Trash.list", err);
      return res.status(500).json({ ok: false, code: "SERVER_ERROR" });
    }
  };

  const restore = async (req, res) => {
    try {
      const entry = await findFor(req);
      if (!entry) return res.status(404).json(NOT_FOUND);
      const result = await bin.restore(entry, req);
      if (!result.ok) return res.status(result.status || 500).json({ ok: false, code: result.code || "RESTORE_FAILED", message: result.message || "تعذرت الاستعادة" });
      await record(req, entry, "restore");
      return res.status(200).json({ ok: true, kind: entry.kind, refId: entry.refId });
    } catch (err) {
      logWithSource("Trash.restore", err);
      return res.status(500).json({ ok: false, code: "SERVER_ERROR" });
    }
  };

  const purge = async (req, res) => {
    try {
      const entry = await findFor(req);
      if (!entry) return res.status(404).json(NOT_FOUND);
      if (!mayPurge(req, entry.kind)) return res.status(403).json({ ok: false, code: "FORBIDDEN", message: "ليست لديك صلاحية الحذف النهائي" });
      const result = await bin.purge(entry);
      if (!result.ok) return res.status(502).json({ ok: false, code: "FILES_LEFT", message: `تعذر حذف ${result.failed} من الملفات. لم يُحذف شيء، حاول مرة أخرى` });
      await record(req, entry, "purge");
      return res.status(200).json({ ok: true });
    } catch (err) {
      logWithSource("Trash.purge", err);
      return res.status(500).json({ ok: false, code: "SERVER_ERROR" });
    }
  };

  return { list, restore, purge };
}

module.exports = { createTrashController, KEY_OF, PURGE_KEY_OF, ...createTrashController() };
