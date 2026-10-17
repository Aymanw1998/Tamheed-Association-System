// Links the whole app to a single Google Drive account. Only the system
// account (SYSTEM_ADMIN_TZ, created by scripts/ensureSystemAdmin.js) may start
// the flow - not every administrator: the app asks for a connect URL (POST,
// with the usual Bearer token) and gets back Google's consent URL carrying a
// one-time state. Google's callback is a plain browser redirect, so it is
// accepted only with a state this server issued, once, within 10 minutes.
const express = require("express");
const { isSystemTz } = require("../../utils/permissions");

const DONE_PATH = "/files?drive=";

// The signed access token carries tz, so this needs no database read.
// An unset SYSTEM_ADMIN_TZ matches nobody. Kept as an exported name over the
// shared isSystemTz rule.
function isSystemAccount(user, systemTz = process.env.SYSTEM_ADMIN_TZ) {
  return isSystemTz(user?.tz, systemTz);
}

function createGoogleDriveRouter({ drive, state, requireAuth, isSystemAccount: isSystem = isSystemAccount }) {
  const router = express.Router();

  const requireSystemAccount = (req, res, next) =>
    isSystem(req.user)
      ? next()
      : res.status(403).json({ code: "FORBIDDEN", message: "ربط Google Drive متاح لحساب النظام فقط" });

  router.post("/connect-url", requireAuth, requireSystemAccount, (req, res) => {
    try {
      const token = state.issue(req.user?.id);
      return res.json({ ok: true, url: drive.getAuthUrl(token) });
    } catch (err) {
      return res.status(500).json({ ok: false, message: err.message });
    }
  });

  router.get("/callback", async (req, res) => {
    const { code, error, state: stateToken } = req.query;
    if (!state.consume(String(stateToken || ""))) return res.redirect(`${DONE_PATH}denied`);
    if (error || !code) return res.redirect(`${DONE_PATH}error`);
    try {
      await drive.handleOAuthCallback(String(code));
      return res.redirect(`${DONE_PATH}connected`);
    } catch (err) {
      console.error("[GoogleDrive] connect failed:", err.message);
      return res.redirect(`${DONE_PATH}error`);
    }
  });

  router.get("/status", requireAuth, async (req, res) => {
    try {
      const status = await drive.getStatus();
      return res.json({ ok: true, ...status, canConnect: isSystem(req.user) });
    } catch (err) {
      return res.status(500).json({ ok: false, message: err.message });
    }
  });

  return router;
}

function defaultRouter() {
  const { requireAuth } = require("../../middleware/authMiddleware");
  const { createDriveConnectState } = require("../../utils/driveConnectState");
  return createGoogleDriveRouter({
    drive: require("../../services/googleDrive.service"),
    state: createDriveConnectState(),
    requireAuth,
  });
}

module.exports = defaultRouter();
module.exports.createGoogleDriveRouter = createGoogleDriveRouter;
module.exports.isSystemAccount = isSystemAccount;
