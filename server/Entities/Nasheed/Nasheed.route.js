const express = require("express");
const { requireNasheedHost } = require("../../middleware/requireNasheed");
const { rateLimit } = require("../../middleware/rateLimit");
const { requirePermission } = require("../../middleware/permissionMiddleware");
const { logWithSource } = require("../../middleware/logger");

// The nasheed site's API (owner, 2026-11-27), only on NASHEED_HOST.
// Guests read: the list and one nasheed, title and lines only. Adding,
// editing, deleting and the undo need the nasheed session (nasheeds.manage).
// Nothing is cached, and search engines are asked not to list the site.
const publicView = (n) => ({ _id: n._id, title: n.title, lines: n.lines, updatedAt: n.updatedAt });

// Per IP, and a band on one Wi-Fi shares one address: 600 a minute lets
// thirty phones open page after page, and still stops a scraper.
const limitPublic = rateLimit({ windowMs: 60 * 1000, max: 600, scope: "nasheed-public" });
const limitLogin = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, scope: "nasheed-login" });

const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";
const NOT_IN_BIN = { ok: false, code: "NOT_FOUND", message: "النشيد غير موجود في سلة المحذوفات" };

const handle = (work) => async (req, res) => {
  try {
    return res.status(200).json({ ok: true, ...((await work(req)) || {}) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
    logWithSource("Nasheed", error);
    return res.status(500).json({ ok: false, message: SERVER_ERROR });
  }
};

function createNasheedRouter({ library, bin, auth, requireNasheed, audit }) {
  const router = express.Router();
  router.use(requireNasheedHost, (req, res, next) => {
    res.set("Cache-Control", "no-store");
    res.set("X-Robots-Tag", "noindex");
    next();
  });

  router.get("/public", limitPublic, handle(async () => ({ nasheeds: (await library().list()).map(publicView) })));
  router.get("/public/:id", limitPublic, handle(async (req) => ({ nasheed: publicView(await library().get(req.params.id)) })));

  router.post("/login", limitLogin, auth.login);
  router.post("/logout", auth.logout);
  router.get("/me", requireNasheed, auth.me);

  // requireNasheed already refuses anyone without the key; the explicit guard
  // keeps every write visible to test/route-guards.test.js.
  router.post("/", requireNasheed, requirePermission("nasheeds.manage"), handle(async (req) => ({ nasheed: await library().create(req.body || {}, req) })));
  router.put("/:id", requireNasheed, requirePermission("nasheeds.manage"), handle(async (req) => ({ nasheed: await library().update(req.params.id, req.body || {}, req) })));
  router.delete("/:id", requireNasheed, requirePermission("nasheeds.manage"), handle((req) => library().remove(req.params.id, req)));

  // The «تراجع» right after a delete; older ones are restored from
  // «سلة المحذوفات» in the main system.
  router.post("/restore/:trashId", requireNasheed, requirePermission("nasheeds.manage"), async (req, res) => {
    try {
      const entry = await bin().get(req.params.trashId);
      if (!entry || entry.kind !== "nasheed") return res.status(404).json(NOT_IN_BIN);
      const result = await bin().restore(entry, req);
      if (!result?.ok) return res.status(result?.status || 500).json({ ok: false, code: result?.code, message: result?.message || SERVER_ERROR });
      await Promise.resolve(audit.record(req, {
        module: "nasheeds", action: "restore", targetType: "nasheed", targetId: String(entry.refId), targetLabel: entry.label,
      })).catch(() => {});
      return res.json({ ok: true, id: String(entry.refId) });
    } catch (error) {
      logWithSource("Nasheed.restore", error);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  });

  return router;
}

// Loaded on first use, so requiring this router does not pull in the database layer.
function defaultRouter() {
  const { requireNasheed } = require("../../middleware/requireNasheed");
  return createNasheedRouter({
    library: () => require("../../services/nasheeds").nasheedLibrary(),
    bin: () => require("../../services/recycleBin").recycleBin,
    auth: require("./Nasheed.auth"),
    requireNasheed,
    audit: require("../../utils/audit").audit,
  });
}

module.exports = { createNasheedRouter, defaultRouter };
