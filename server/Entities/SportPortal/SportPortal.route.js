const express = require("express");
const auth = require("./SportPortal.auth");
const portal = require("./SportPortal.controller");
const { rateLimit } = require("../../middleware/rateLimit");
const push = require("../Push/Push.route");

const router = express.Router();

// 30 per IP: the children share the association's Wi-Fi (one IP); the per-student 5-try lock still stops guessing.
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, scope: "sport-login" });

router.post("/request-code", loginLimit, auth.requestCode);
router.post("/verify", loginLimit, auth.verify);
router.post("/logout", auth.logout);
router.get("/me", auth.requireSportStudent, portal.me);
router.get("/photo", auth.requireSportStudent, portal.photo);

const pushHandlers = push.subscribeHandlers({ store: push.store, owner: push.sportOwner, source: "SportPush" });
router.post("/push/subscribe", auth.requireSportStudent, pushHandlers.subscribe);
router.delete("/push/subscribe", auth.requireSportStudent, pushHandlers.unsubscribe);

module.exports = router;
