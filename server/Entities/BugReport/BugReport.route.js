const express = require("express");
const multer = require("multer");
const { requireAuth } = require("../../middleware/authMiddleware");
const { loadActor } = require("../../middleware/permissionMiddleware");
const { rateLimit } = require("../../middleware/rateLimit");
const { bugReports } = require("./BugReport.controller");

const router = express.Router();
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }).single("image");
// Per signed-in user: a stuck button cannot flood the IT mailboxes.
const reportLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 10, scope: "bug-report", keyFn: (req) => req.actor?.id });

const withImage = (req, res, next) => upload(req, res, (err) => {
  if (!err) return next();
  return res.status(400).json({ ok: false, code: "BAD_IMAGE", message: "الصورة كبيرة جدًا (حتى 5 ميغابايت)" });
});

// Any signed-in user of System, with any role or none.
router.post("/", requireAuth, loadActor, reportLimit, withImage, bugReports.create);

module.exports = router;
