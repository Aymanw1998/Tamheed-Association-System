const express = require("express");
const { requireAuth } = require("../../middleware/authMiddleware");
const { loadActor, requirePermission } = require("../../middleware/permissionMiddleware");
const { logWithSource } = require("../../middleware/logger");

// Web push subscriptions.
//   GET    /key         public: the VAPID public key -> { ok, key }; key is
//                        null while phone notifications are off
//   GET    /settings    permissions.manage: { ok, enabled, keysFrom }
//   PUT    /settings    permissions.manage: { enabled } -> the same
//   POST   /subscribe   staff (signed in): { subscription } -> upsert by endpoint
//   DELETE /subscribe   staff: remove the caller's own subscription
// The sport site has the same pair under /api/sport-portal/push (see
// SportPortal.route.js); both use subscribeHandlers.
const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";
const BAD_SUBSCRIPTION = { ok: false, code: "BAD_SUBSCRIPTION", message: "اشتراك الإشعارات غير صالح" };

const MAX_ENDPOINT = 1000;
const MAX_KEY = 200;
const MAX_PER_OWNER = 10;
// Only the browsers' own push services: the server POSTs to this address, so
// anything else (localhost, internal hosts, look-alike domains) is refused.
const PUSH_HOSTS = new Set(["fcm.googleapis.com", "web.push.apple.com"]);
const PUSH_SUFFIXES = [".push.services.mozilla.com", ".notify.windows.com", ".push.apple.com"];

const allowedEndpoint = (endpoint) => {
  let url;
  try { url = new URL(endpoint); } catch { return false; }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.has(host) || PUSH_SUFFIXES.some((suffix) => host.endsWith(suffix) && host.length > suffix.length);
};

const NO_OWNER = { ok: false, code: "NO_OWNER" };

const clean = (subscription) => {
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (![endpoint, p256dh, auth].every((v) => typeof v === "string" && v)) return null;
  if (endpoint.length > MAX_ENDPOINT || p256dh.length > MAX_KEY || auth.length > MAX_KEY) return null;
  if (!allowedEndpoint(endpoint)) return null;
  return { endpoint, keys: { p256dh, auth } };
};

// `owner(req)` returns { kind, tz } or { kind, studentId } for the caller.
function subscribeHandlers({ store, owner, source }) {
  return {
    subscribe: async (req, res) => {
      try {
        const sub = clean(req.body?.subscription);
        if (!sub) return res.status(400).json(BAD_SUBSCRIPTION);
        const who = owner(req);
        if (!who) return res.status(401).json(NO_OWNER);
        await store.upsert({
          kind: who.kind,
          tz: who.tz ?? null,
          studentId: who.studentId ?? null,
          ...sub,
          createdAt: new Date(),
        });
        await store.trimOwner(who, MAX_PER_OWNER);
        return res.status(200).json({ ok: true });
      } catch (error) {
        logWithSource(`${source}.subscribe`, error);
        return res.status(500).json({ ok: false, message: SERVER_ERROR });
      }
    },
    unsubscribe: async (req, res) => {
      try {
        const endpoint = req.body?.subscription?.endpoint;
        if (typeof endpoint !== "string" || !endpoint) return res.status(400).json(BAD_SUBSCRIPTION);
        const who = owner(req);
        if (!who) return res.status(401).json(NO_OWNER);
        await store.remove(endpoint, who.kind === "staff" ? { tz: who.tz } : { studentId: who.studentId });
        return res.status(200).json({ ok: true });
      } catch (error) {
        logWithSource(`${source}.unsubscribe`, error);
        return res.status(500).json({ ok: false, message: SERVER_ERROR });
      }
    },
  };
}

const staffOwner = (req) => (req.actor?.tz ? { kind: "staff", tz: String(req.actor.tz) } : null);
const sportOwner = (req) => (req.sportStudent?._id ? { kind: "sport", studentId: String(req.sportStudent._id) } : null);

// VAPID needs a contact (mailto: or https:). The site's own address is used:
// it is known on every server and is never a person's private address.
const contactFor = (req) => {
  const host = String(req.get("host") || "").toLowerCase();
  return /^[a-z0-9.-]+(:\d+)?$/.test(host) ? `https://${host}` : "https://tamheed.local";
};

function createPushRouter({ requireAuth, loadActor, requirePermission, store, push }) {
  const router = express.Router();
  const handlers = subscribeHandlers({ store, owner: staffOwner, source: "Push" });

  router.get("/key", async (req, res) => {
    try {
      res.set("Cache-Control", "no-store");
      return res.status(200).json({ ok: true, key: await push.publicKey() });
    } catch (error) {
      logWithSource("Push.key", error);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  });
  router.post("/subscribe", requireAuth, loadActor, handlers.subscribe);
  router.delete("/subscribe", requireAuth, loadActor, handlers.unsubscribe);

  router.get("/settings", requireAuth, loadActor, requirePermission("permissions.manage"), async (req, res) => {
    try {
      return res.status(200).json({ ok: true, ...(await push.status()) });
    } catch (error) {
      logWithSource("Push.settings", error);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  });
  router.put("/settings", requireAuth, loadActor, requirePermission("permissions.manage"), async (req, res) => {
    try {
      const enabled = req.body?.enabled;
      if (typeof enabled !== "boolean") return res.status(400).json({ ok: false, code: "BAD_SETTING" });
      const state = await push.setEnabled(enabled, { subject: contactFor(req), by: req.actor?.tz });
      logWithSource("Push.settings", `phone notifications ${enabled ? "on" : "off"} by ${req.actor?.tz}`);
      return res.status(200).json({ ok: true, ...state });
    } catch (error) {
      logWithSource("Push.settings", error);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  });
  return router;
}

// The sport pair, mountable on its own (the real site wires the same
// handlers straight into SportPortal.route.js).
function createSportSubscribeRouter({ requireSportStudent, store }) {
  const router = express.Router();
  const handlers = subscribeHandlers({ store, owner: sportOwner, source: "SportPush" });
  router.route("/subscribe").post(requireSportStudent, handlers.subscribe).delete(requireSportStudent, handlers.unsubscribe);
  return router;
}

const store = require("./PushSubscription.model").PushSubscriptionModelDef;

const router = createPushRouter({ requireAuth, loadActor, requirePermission, store, push: require("../../utils/push").push });

module.exports = router;
module.exports.createPushRouter = createPushRouter;
module.exports.createSportSubscribeRouter = createSportSubscribeRouter;
module.exports.subscribeHandlers = subscribeHandlers;
module.exports.sportOwner = sportOwner;
module.exports.store = store;
