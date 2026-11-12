const express = require("express");
const { requireAuth } = require("../../middleware/authMiddleware");
const { loadActor, requirePermission } = require("../../middleware/permissionMiddleware");
const { objectIdParam } = require("../../middleware/objectIdParam");
const { rateLimit } = require("../../middleware/rateLimit");
const { logWithSource } = require("../../middleware/logger");
const { displayScreens } = require("../../services/displayScreens");

// Wall display screens (owner, 2026-11-12).
const router = express.Router();

const noStore = (req, res, next) => { res.set("Cache-Control", "no-store"); next(); };
const handle = (work) => async (req, res) => {
  try {
    return res.status(200).json({ ok: true, ...((await work(req)) || {}) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ ok: false, code: error.code, message: error.message });
    logWithSource("Display", error);
    return res.status(500).json({ ok: false, message: "حدث خطأ غير متوقع، حاول مرة أخرى" });
  }
};

// Public: the TV reads the program with the secret from its link. The secret
// travels in the body (the page keeps it in the URL fragment), so it never
// reaches a path, query string or access log. Answers 410 for any link that
// is malformed, unknown or revoked.
// A TV checks every 10 seconds; 90 a minute lets 15 screens share one address.
const limitFeed = rateLimit({ windowMs: 60 * 1000, max: 90, scope: "display-feed" });
router.post("/feed", limitFeed, noStore, handle(async (req) => ({ feed: await displayScreens().feed(req.body?.token) })));

router.use(requireAuth, loadActor);
router.param("id", objectIdParam);

router.get("/", requirePermission("displays.manage"), handle(async () => ({ screens: await displayScreens().list() })));
router.post("/", requirePermission("displays.manage"), noStore, handle(async (req) => {
  const { screen, secret } = await displayScreens().create(req.body || {}, req);
  return { screen, token: secret };
}));
router.put("/:id", requirePermission("displays.manage"), handle((req) => displayScreens().update(req.params.id, req.body || {}, req)));
router.post("/:id/rotate", requirePermission("displays.manage"), noStore, handle(async (req) => ({ token: (await displayScreens().rotate(req.params.id, req)).secret })));
router.delete("/:id", requirePermission("displays.manage"), handle((req) => displayScreens().remove(req.params.id, req)));

module.exports = router;
