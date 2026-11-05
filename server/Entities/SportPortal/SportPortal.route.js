const express = require("express");
const auth = require("./SportPortal.auth");
const passkey = require("./SportPortal.passkey");
const portal = require("./SportPortal.controller");
const push = require("../Push/Push.route");
const { createSportLive } = require("./SportPortal.live");

const router = express.Router();

// No limit per address: the children share one Wi-Fi. Guessing stops per student
// (5 tries, then a lock), and a new code is sent at most once a minute (SportPortal.auth.js).

router.post("/request-code", auth.requestCode);
router.post("/verify", auth.verify);
// The sign-in card's QR (players without email).
router.post("/card", auth.signInWithCard);
// Passkeys: saved by a signed-in player, then a fingerprint or face signs in.
router.post("/passkey/login-options", passkey.loginOptions);
router.post("/passkey/login", passkey.login);
router.post("/passkey/register-options", auth.requireSportStudent, passkey.registerOptions);
router.post("/passkey/register", auth.requireSportStudent, passkey.register);
router.post("/logout", auth.logout);
router.get("/me", auth.requireSportStudent, portal.me);
router.get("/photo", auth.requireSportStudent, portal.photo);
router.get("/id", auth.requireSportStudent, portal.idNumber);
router.get("/notices", auth.requireSportStudent, portal.notices);
// SSE: tells the open sport site to reload /me when staff change the player.
router.get("/live", auth.requireSportStudent, createSportLive());

const pushHandlers = push.subscribeHandlers({ store: push.store, owner: push.sportOwner, source: "SportPush" });
router.post("/push/subscribe", auth.requireSportStudent, pushHandlers.subscribe);
router.delete("/push/subscribe", auth.requireSportStudent, pushHandlers.unsubscribe);

module.exports = router;
