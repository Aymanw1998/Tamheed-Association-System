const express = require("express");
const { logWithSource } = require("../middleware/logger");
const tourState = require("../utils/tourState");

// The caller's own product-tour state, kept on the user record (utils/tourState.js).
// Every route: signed in, active user. Always the caller's own record, never a
// tz from the client, except /reset/:tz which needs users.edit.
//   GET  /                { tours, knownKeys (null = never seeded), seenReleases }
//   POST /item/:id        { status, version } -> { tours }; 400 BAD_INPUT, 409 TOO_MANY
//   POST /known-keys      { keys } -> { knownKeys } (only keys the caller holds)
//   POST /releases/seen   { ids } -> { seenReleases }; 400 BAD_INPUT
//   POST /reset/:tz       clears that user's tours only (not knownKeys/seenReleases);
//                         users.edit + canManageTarget: 403 FORBIDDEN, 404 missing/system
const BAD_INPUT = { ok: false, code: "BAD_INPUT", message: "بيانات غير صالحة." };
const TOO_MANY = { ok: false, code: "TOO_MANY", message: "عدد الجولات أكبر من المسموح." };
const FORBIDDEN = { ok: false, code: "FORBIDDEN", message: "لا توجد صلاحية" };
const NOT_FOUND = { ok: false, code: "NOT_FOUND", message: "غير موجود" };
const SERVER_ERROR = { ok: false, code: "SERVER_ERROR", message: "حدث خطأ غير متوقع، حاول مرة أخرى." };

function createToursRouter({ requireAuth, loadActor, requirePermission, users, audit, canManageTarget, isSystemTz }) {
  const router = express.Router();

  const guarded = (name, handler) => async (req, res) => {
    try {
      return await handler(req, res);
    } catch (error) {
      logWithSource(`tours.${name}`, String(error?.name || "Error"));
      return res.status(500).json(SERVER_ERROR);
    }
  };

  const save = (tz, patch) => users.update({ tz }, patch, "active");

  async function getState(req, res) {
    const user = req.actor.user || {};
    return res.json({
      ok: true,
      tours: user.tours || {},
      knownKeys: Array.isArray(user.knownKeys) ? user.knownKeys : null,
      seenReleases: Array.isArray(user.seenReleases) ? user.seenReleases : [],
    });
  }

  async function setTour(req, res) {
    const update = tourState.parseTourUpdate(req.params.id, req.body);
    if (!update) return res.status(400).json(BAD_INPUT);
    const tours = tourState.applyTour(req.actor.user?.tours, update);
    if (!tours) return res.status(409).json(TOO_MANY);
    // A null-prototype object is not storable as is.
    const plain = { ...tours };
    await save(req.actor.tz, { tours: plain });
    return res.json({ ok: true, tours: plain });
  }

  async function setKnownKeys(req, res) {
    const knownKeys = tourState.mergeKnownKeys(req.actor.user?.knownKeys, req.body?.keys, req.actor.permissions);
    await save(req.actor.tz, { knownKeys });
    return res.json({ ok: true, knownKeys });
  }

  async function setSeenReleases(req, res) {
    const seenReleases = tourState.mergeSeenReleases(req.actor.user?.seenReleases, req.body?.ids);
    if (!seenReleases) return res.status(400).json(BAD_INPUT);
    await save(req.actor.tz, { seenReleases });
    return res.json({ ok: true, seenReleases });
  }

  async function resetTours(req, res) {
    const tz = String(req.params.tz || "").trim();
    if (!tz || isSystemTz(tz)) return res.status(404).json(NOT_FOUND);
    const found = await users.get({ tz }, "active");
    const target = found?.success && Array.isArray(found.result) ? found.result[0] : null;
    if (!target || isSystemTz(target.tz)) return res.status(404).json(NOT_FOUND);
    if (!canManageTarget(req.actor, target)) return res.status(403).json(FORBIDDEN);

    await save(target.tz, { tours: {} });
    await audit.record(req, {
      module: "users", action: "tours_reset", targetType: "user",
      targetId: target.tz,
      targetLabel: `${target.firstname || ""} ${target.lastname || ""}`.trim() || String(target.tz),
      before: { tz: target.tz, tours: target.tours || {} },
      after: { tz: target.tz, tours: {} },
    });
    return res.json({ ok: true });
  }

  router.get("/", requireAuth, loadActor, guarded("get", getState));
  router.post("/item/:id", requireAuth, loadActor, guarded("item", setTour));
  router.post("/known-keys", requireAuth, loadActor, guarded("knownKeys", setKnownKeys));
  router.post("/releases/seen", requireAuth, loadActor, guarded("releases", setSeenReleases));
  router.post("/reset/:tz", requireAuth, loadActor, requirePermission("users.edit"), guarded("reset", resetTours));

  return router;
}

function defaultRouter() {
  const { requireAuth } = require("../middleware/authMiddleware");
  const { loadActor, requirePermission } = require("../middleware/permissionMiddleware");
  return createToursRouter({
    requireAuth,
    loadActor,
    requirePermission,
    // Loaded on first use: the user model needs the server's environment.
    users: {
      get: (...args) => require("../Entities/User/User.model").UserModelDef.get(...args),
      update: (...args) => require("../Entities/User/User.model").UserModelDef.update(...args),
    },
    audit: { record: (...args) => require("../utils/audit").audit.record(...args) },
    canManageTarget: require("../utils/permissionRules").canManageTarget,
    isSystemTz: require("../utils/permissions").isSystemTz,
  });
}

module.exports = defaultRouter();
module.exports.createToursRouter = createToursRouter;
