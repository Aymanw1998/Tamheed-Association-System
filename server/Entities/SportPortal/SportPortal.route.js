const express = require("express");
const auth = require("./SportPortal.auth");
const portal = require("./SportPortal.controller");
const { rateLimit } = require("../../middleware/rateLimit");

const router = express.Router();

const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 8, scope: "sport-login" });

router.post("/request-code", loginLimit, auth.requestCode);
router.post("/verify", loginLimit, auth.verify);
router.post("/logout", auth.logout);
router.get("/me", auth.requireSportStudent, portal.me);
router.get("/photo", auth.requireSportStudent, portal.photo);

module.exports = router;
