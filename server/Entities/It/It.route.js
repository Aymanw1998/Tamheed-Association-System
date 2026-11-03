const express = require("express");
const auth = require("./It.auth");
const { requireIt, requireItHost } = require("../../middleware/requireIt");
const { rateLimit } = require("../../middleware/rateLimit");

const router = express.Router();

// Only IT_HOST reaches any IT route; every other host gets 404.
router.use(requireItHost);

// Per IP; the password lockout and the code's five tries still stop guessing.
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, scope: "it-login" });

router.post("/login", loginLimit, auth.login);
router.post("/verify", loginLimit, auth.verify);
router.post("/logout", auth.logout);
router.get("/me", requireIt, auth.me);

module.exports = router;
