// The recycle bin (owner, 2026-11-16). A delete puts the record here and
// removes it from its own collection; for 30 days it can be restored (also by
// the "تراجع" button shown for 8 seconds after the delete) or deleted for good.
// After 30 days the daily job deletes it for good.
//
// Each kind's controller supplies the two steps that depend on it:
//   restore(entry, req) -> { ok: true } | { ok: false, status, message }
//   purge(entry)        -> { failed }  (files that could not be removed; 0 = done)
// Files (a student's photo, a vehicle's Drive documents) stay until the purge,
// so a restored record comes back whole.
const { TrashModelDef, KEEP_DAYS, KINDS } = require("../Entities/Trash/Trash.model");
const { logWithSource } = require("../middleware/logger");

const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_HOOKS = {
  student: () => require("../Entities/Student/Student.controller").trashHooks,
  vehicle: () => require("../Entities/Vehicle/Vehicle.controller").trashHooks,
  user: () => require("../Entities/User/User.controller").trashHooks,
};

function createRecycleBin({ model = TrashModelDef, hooks = DEFAULT_HOOKS, now = () => new Date(), log = logWithSource } = {}) {
  const hooksOf = (kind) => (typeof hooks[kind] === "function" ? hooks[kind]() : hooks[kind]);

  // The record as it was, before its own delete runs. Returns the bin row's id.
  async function put(kind, { refId, label, data, extras = {}, actor }) {
    if (!KINDS.includes(kind)) throw new Error(`unknown recycle bin kind: ${kind}`);
    const created = await model.create({
      kind,
      refId: String(refId),
      label: String(label || ""),
      data,
      extras,
      deletedAt: now(),
      deletedBy: { tz: String(actor?.tz || ""), name: actor?.name || "" },
    });
    return String(created?.result?._id || "");
  }

  // Undo of put() when the record's own delete did not happen.
  async function drop(id) {
    if (id) await model.delete({ _id: id }).catch((err) => log("recycleBin.drop", err));
  }

  async function get(id) {
    try {
      const found = await model.get({ _id: String(id) });
      return found?.result?.[0] || null;
    } catch {
      return null; // a malformed id is "not found"
    }
  }

  async function list(kinds = KINDS) {
    const found = await model.get({ kind: { $in: kinds } });
    return (found?.result || [])
      .filter((entry) => kinds.includes(entry.kind))
      .sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
  }

  async function restore(entry, req) {
    const result = await hooksOf(entry.kind).restore(entry, req);
    if (result?.ok) await model.delete({ _id: String(entry._id) });
    return result || { ok: false, status: 500 };
  }

  async function purge(entry) {
    const { failed = 0 } = (await hooksOf(entry.kind).purge(entry)) || {};
    if (failed > 0) return { ok: false, failed };
    await model.delete({ _id: String(entry._id) });
    return { ok: true };
  }

  // The daily job: every row older than KEEP_DAYS is deleted for good. A row
  // whose files cannot be removed now stays and is tried again tomorrow.
  async function purgeExpired() {
    const cutoff = new Date(now().getTime() - KEEP_DAYS * DAY_MS);
    const found = await model.get({ deletedAt: { $lt: cutoff } });
    let purged = 0;
    for (const entry of found?.result || []) {
      if (!(new Date(entry.deletedAt) < cutoff)) continue;
      try {
        if ((await purge(entry)).ok) purged += 1;
      } catch (err) {
        log("recycleBin.purgeExpired", err);
      }
    }
    return purged;
  }

  const expiresAt = (entry) => new Date(new Date(entry.deletedAt).getTime() + KEEP_DAYS * DAY_MS);

  return { put, drop, get, list, restore, purge, purgeExpired, expiresAt };
}

const recycleBin = createRecycleBin();

// Once a day (and once shortly after start).
function startRecycleBinJob({ bin = recycleBin, setIntervalFn = setInterval, setTimeoutFn = setTimeout } = {}) {
  const run = () => bin.purgeExpired()
    .then((n) => n && console.log(`Recycle bin: ${n} deleted for good`))
    .catch((err) => logWithSource("recycleBin.job", err));
  const first = setTimeoutFn(run, 60 * 1000);
  const timer = setIntervalFn(run, DAY_MS);
  first?.unref?.();
  timer?.unref?.();
  return timer;
}

module.exports = { createRecycleBin, recycleBin, startRecycleBinJob, KEEP_DAYS, KINDS };
