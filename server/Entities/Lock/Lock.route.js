const express = require("express");
const { requireAuth } = require("../../middleware/authMiddleware");
const { loadActor, requirePermission } = require("../../middleware/permissionMiddleware");
const { logWithSource } = require("../../middleware/logger");
const { liveHub } = require("../../services/liveHub");
const { createLocks } = require("../../services/locks");
const { can } = require("../../utils/permissions");
const { hasVehiclePermission } = require("../../utils/vehicleRules");
const { lockedMessage } = require("../../middleware/lockGuard");

// Item locks, owned by a browser tab (header X-Client-Id).
//   POST /acquire        { key } -> 200 { ok, lock } | 423 { ok:false, code:"LOCKED", holder }
//   POST /heartbeat      { key } -> 200 { ok:true }  | 410 { ok:false, code:"LOST" }
//   POST /release        { key } -> 200 { ok:true }   (no-op for a non-owner;
//                          a beacon may send { clientId, token } in the body)
//   POST /force-release  { key } -> 200 { ok:true }   (permissions.manage)
//   GET  /:key                   -> 200 { ok, holder|null }
// Taking or keeping a lock needs the module's edit permission (the same keys
// its write routes require); reading the holder needs its view permission.
// The holder is always the tab, so the
// same user in another tab is blocked like anyone else.
const KEY_PATTERN = /^(?:(?:student|player|lesson|sportLesson|report|user|vehicle):[^\s:]{1,64}|(?:attendance|sportAttendance):[^\s:]{1,64}:\d{4}-\d{2}-\d{2})$/;
const FORBIDDEN = { ok: false, code: "FORBIDDEN", message: "لا توجد صلاحية" };
const SPORT_EDIT = ["sports.coach", "sports.manage"];
const SPORT_VIEW = ["sports.view", "sports.coach", "sports.manage"];
const anyOf = (keys) => (actor) => keys.some((key) => can(actor?.permissions, key));
const vehicle = (perms) => (actor) => perms.some((perm) => hasVehiclePermission(actor, perm));
// A user's own record (requireSelfOr on the user routes).
const selfOr = (keys) => (actor, id) => String(actor?.id ?? "") === String(id) || anyOf(keys)(actor);
// prefix -> { edit(actor, id), view(actor, id) }
const LOCK_RULES = {
  student: { edit: anyOf(["students.edit", "students.photo", "students.delete"]), view: anyOf(["students.view"]) },
  lesson: { edit: anyOf(["lessons.edit", "lessons.roster", "lessons.delete"]), view: anyOf(["lessons.view"]) },
  attendance: { edit: anyOf(["attendance.record"]), view: anyOf(["attendance.view"]) },
  player: { edit: anyOf(SPORT_EDIT), view: anyOf(SPORT_VIEW) },
  sportLesson: { edit: anyOf(SPORT_EDIT), view: anyOf(SPORT_VIEW) },
  sportAttendance: { edit: anyOf(SPORT_EDIT), view: anyOf(SPORT_VIEW) },
  // GET /report needs no key: everyone sees at least his own reports.
  report: { edit: anyOf(["reports.editOwn", "reports.editAll", "reports.delete"]), view: () => true },
  user: {
    edit: selfOr(["users.edit", "users.approve", "users.unlock", "users.changeRole", "users.delete", "permissions.manage", "files.manageAll"]),
    view: selfOr(["users.view"]),
  },
  vehicle: {
    edit: (actor) => vehicle(["edit", "compliance", "documents", "archive"])(actor) || can(actor?.permissions, "vehicles.delete"),
    view: vehicle(["view"]),
  },
};
const allowed = (kind, actor, key) => {
  const [prefix, id] = String(key).split(":");
  const rule = LOCK_RULES[prefix];
  return Boolean(rule && rule[kind](actor, id));
};
const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";
const BAD_KEY = { ok: false, code: "BAD_KEY", message: "مفتاح القفل غير صالح" };
const NO_CLIENT = { ok: false, code: "NO_CLIENT", message: "معرّف المتصفح مفقود" };

function createLockRouter({ requireAuth, loadActor, requirePermission, locks }) {
  const router = express.Router();

  // Validates the key and the client id; sets req.lockKey / req.clientId.
  const readInput = (keyOf) => (req, res, next) => {
    const key = keyOf(req);
    if (typeof key !== "string" || !KEY_PATTERN.test(key)) return res.status(400).json(BAD_KEY);
    const clientId = req.get("X-Client-Id") || (typeof req.body?.clientId === "string" ? req.body.clientId : "");
    if (!clientId || clientId.length > 100) return res.status(400).json(NO_CLIENT);
    req.lockKey = key;
    req.clientId = clientId;
    return next();
  };
  const fromBody = readInput((req) => req.body?.key);
  const fromParam = readInput((req) => req.params.key);
  // navigator.sendBeacon (tab closing) cannot set headers: /release also takes
  // the access token and the client id from the body when the headers are absent.
  const beaconHeaders = (req, res, next) => {
    if (!req.headers.authorization && typeof req.body?.token === "string" && req.body.token) {
      req.headers.authorization = `Bearer ${req.body.token}`;
    }
    return next();
  };
  const guard = (name, fn) => async (req, res) => {
    try {
      return await fn(req, res);
    } catch (error) {
      logWithSource(`Lock.${name}`, error);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  const canEdit = (req, res, next) => (allowed("edit", req.actor, req.lockKey) ? next() : res.status(403).json(FORBIDDEN));

  const acquire = guard("acquire", async (req, res) => {
    const result = await locks.acquire(req.lockKey, {
      clientId: req.clientId,
      userId: req.actor.id,
      tz: req.actor.tz,
      name: req.actor.name,
    });
    if (result.ok) return res.status(200).json({ ok: true, lock: result.lock, created: result.created !== false });
    return res.status(423).json({ ok: false, code: "LOCKED", holder: result.holder, message: lockedMessage(result.holder) });
  });

  const heartbeat = guard("heartbeat", async (req, res) => {
    if (await locks.heartbeat(req.lockKey, req.clientId)) return res.status(200).json({ ok: true });
    return res.status(410).json({ ok: false, code: "LOST" });
  });

  const release = guard("release", async (req, res) => {
    await locks.release(req.lockKey, req.clientId);
    return res.status(200).json({ ok: true });
  });

  const forceRelease = guard("forceRelease", async (req, res) => {
    await locks.forceRelease(req.lockKey);
    return res.status(200).json({ ok: true });
  });

  const holder = guard("holder", async (req, res) => {
    // Without the module's view permission the holder is not revealed.
    if (!allowed("view", req.actor, req.lockKey)) return res.status(200).json({ ok: true, holder: null });
    return res.status(200).json({ ok: true, holder: await locks.holderOf(req.lockKey, req.clientId) });
  });

  router.post("/acquire", requireAuth, loadActor, fromBody, canEdit, acquire);
  router.post("/heartbeat", requireAuth, loadActor, fromBody, canEdit, heartbeat);
  router.post("/release", beaconHeaders, requireAuth, loadActor, fromBody, release);
  router.post("/force-release", requireAuth, loadActor, requirePermission("permissions.manage"), fromBody, forceRelease);
  router.get("/:key", requireAuth, loadActor, fromParam, holder);

  return router;
}

const router = createLockRouter({
  requireAuth,
  loadActor,
  requirePermission,
  locks: createLocks({ model: require("./Lock.model").LockModelDef, hub: liveHub }),
});

module.exports = router;
module.exports.createLockRouter = createLockRouter;
module.exports.KEY_PATTERN = KEY_PATTERN;
module.exports.LOCK_RULES = LOCK_RULES;
