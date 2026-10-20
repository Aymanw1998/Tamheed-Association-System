const express = require("express");
const { requireAuth } = require("../../middleware/authMiddleware");
const { loadActor } = require("../../middleware/permissionMiddleware");
const { logWithSource } = require("../../middleware/logger");
const { visibleAlertTypes } = require("../../services/alertAccess");

// The caller's own alert inbox (AiAlerts). No permission key: every query is
// filtered by the signed-in user's tz, so nobody can read or mark another
// user's alerts.
//   GET  /?unread=1   newest first, at most 50, only types the caller may
//                     still see (services/alertAccess) -> { ok, alerts, total }
//   POST /read-all    -> { ok, updated }
//   POST /:id/read    -> { ok } (404 when the alert is not the caller's)
const LIMIT = 50;
const OBJECT_ID = /^[a-f0-9]{24}$/i;
const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";
const NOT_FOUND = { ok: false, code: "NOT_FOUND", message: "التنبيه غير موجود" };

const view = (row) => ({
  id: String(row._id),
  type: row.type,
  severity: row.severity,
  text: row.text,
  link: row.link || "",
  at: row.at,
  read: Boolean(row.readAt),
});

function createAlertRouter({ requireAuth, loadActor, store, now = () => new Date() }) {
  const router = express.Router();
  router.use(requireAuth, loadActor);

  router.get("/", async (req, res) => {
    try {
      const unreadOnly = req.query.unread === "1" || req.query.unread === "true";
      // Only the types the caller may still see now (a demoted user stops
      // seeing alerts sent under their old permissions).
      const types = visibleAlertTypes(req.actor);
      const { result, total } = await store.listFor(req.actor.tz, { unreadOnly, limit: LIMIT, types });
      return res.status(200).json({ ok: true, alerts: (result || []).map(view), total });
    } catch (error) {
      logWithSource("Alert.list", error);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  });

  router.post("/read-all", async (req, res) => {
    try {
      const updated = await store.markAllRead(req.actor.tz, now());
      return res.status(200).json({ ok: true, updated });
    } catch (error) {
      logWithSource("Alert.readAll", error);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  });

  router.post("/:id/read", async (req, res) => {
    try {
      const id = String(req.params.id || "");
      if (!OBJECT_ID.test(id)) return res.status(404).json(NOT_FOUND);
      const row = await store.markRead(req.actor.tz, id, now());
      if (!row) return res.status(404).json(NOT_FOUND);
      return res.status(200).json({ ok: true });
    } catch (error) {
      logWithSource("Alert.read", error);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  });

  return router;
}

const router = createAlertRouter({
  requireAuth,
  loadActor,
  store: require("./Alert.model").AlertModelDef,
});

module.exports = router;
module.exports.createAlertRouter = createAlertRouter;
