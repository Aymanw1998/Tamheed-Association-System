// One-time admin flow to link the app to a single Google Drive account.
// /connect and /callback are plain browser navigations (not fetch calls), so
// they can't carry an Authorization: Bearer header - keep that in mind if you
// add auth here later; for now this is meant to be run locally/by an admin.
const express = require("express");
const router = express.Router();
const { requireAuth } = require("../../middleware/authMiddleware");
const googleDrive = require("../../services/googleDrive.service");

router.get("/connect", (req, res) => {
  try {
    const url = googleDrive.getAuthUrl();
    res.redirect(url);
  } catch (err) {
    res.status(500).send(`Failed to start Google Drive connection: ${err.message}`);
  }
});

router.get("/callback", async (req, res) => {
  try {
    const { code, error } = req.query;
    if (error) return res.status(400).send(`Google returned an error: ${error}`);
    if (!code) return res.status(400).send("Missing code");

    const { email } = await googleDrive.handleOAuthCallback(String(code));
    res.send(
      `<html><body style="font-family:sans-serif;text-align:center;margin-top:60px">` +
        `<h2>Google Drive connected</h2><p>${email}</p><p>You can close this tab.</p></body></html>`
    );
  } catch (err) {
    res.status(500).send(`<html><body><h2>Failed to connect</h2><pre>${err.message}</pre></body></html>`);
  }
});

router.get("/status", requireAuth, async (req, res) => {
  try {
    const status = await googleDrive.getStatus();
    res.json({ ok: true, ...status });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

module.exports = router;
