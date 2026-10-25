const express = require("express");
const { requireAuth } = require("../../middleware/authMiddleware");
const { loadActor, requirePermission } = require("../../middleware/permissionMiddleware");
const { logWithSource } = require("../../middleware/logger");
const { liveHub } = require("../../services/liveHub");
const { createLocks } = require("../../services/locks");

// Item locks, owned by a browser tab (header X-Client-Id).
//   POST /acquire        { key } -> 200 { ok, lock } | 423 { ok:false, code:"LOCKED", holder }
//   POST /heartbeat      { key } -> 200 { ok:true }  | 410 { ok:false, code:"LOST" }
//   POST /release        { key } -> 200 { ok:true }   (no-op for a non-owner;
//                          a beacon may send { clientId, token } in the body)
//   POST /force-release  { key } -> 200 { ok:true }   (permissions.manage)
//   GET  /:key                   -> 200 { ok, holder|null }
// Any signed-in user may take a lock; the holder is always the tab, so the
// same user in another tab is blocked like anyone else.
const KEY_PATTERN = /^(?:(?:student|player|lesson|sportLesson|report|user|vehicle):[^\s:]{1,64}|(?:attendance|sportAttendance):[^\s:]{1,64}:\d{4}-\d{2}-\d{2})$/;
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

  const acquire = guard("acquire", async (req, res) => {
    const result = await locks.acquire(req.lockKey, {
      clientId: req.clientId,
      userId: req.actor.id,
      tz: req.actor.tz,
      name: req.actor.name,
    });
    if (result.ok) return res.status(200).json({ ok: true, lock: result.lock });
    return res.status(423).json({ ok: false, code: "LOCKED", holder: result.holder });
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
    return res.status(200).json({ ok: true, holder: await locks.holderOf(req.lockKey, req.clientId) });
  });

  router.post("/acquire", requireAuth, loadActor, fromBody, acquire);
  router.post("/heartbeat", requireAuth, loadActor, fromBody, heartbeat);
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
