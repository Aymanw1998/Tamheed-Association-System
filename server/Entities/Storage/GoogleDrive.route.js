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

const noAudit = { record: async () => {} };

function createGoogleDriveRouter({ drive, state, requireAuth, isSystemAccount: isSystem = isSystemAccount, audit = noAudit }) {
  const router = express.Router();

  const requireSystemAccount = (req, res, next) =>
    isSystem(req.user)
      ? next()
      : res.status(403).json({ code: "FORBIDDEN", message: "ربط Google Drive متاح لحساب النظام فقط" });

  router.post("/connect-url", requireAuth, requireSystemAccount, (req, res) => {
    try {
      // The callback is a public redirect with no signed-in user, so the state
      // carries who started the flow (always the system account) for the audit log.
      const tz = String(req.user?.tz || "");
      const token = state.issue(req.user?.id, Date.now(), { tz, name: req.user?.name || tz, isSystem: true });
      return res.json({ ok: true, url: drive.getAuthUrl(token) });
    } catch (err) {
      return res.status(500).json({ ok: false, message: err.message });
    }
  });

  router.get("/callback", async (req, res) => {
    const { code, error, state: stateToken } = req.query;
    const issued = state.consume(String(stateToken || ""));
    if (!issued) return res.redirect(`${DONE_PATH}denied`);
    if (error || !code) return res.redirect(`${DONE_PATH}error`);
    try {
      const connected = await drive.handleOAuthCallback(String(code));
      const email = String(connected?.email || "");
      await audit.record({ actor: issued.actor || { tz: "", isSystem: true }, ip: req.ip }, {
        module: "files", action: "drive_connect", targetType: "drive",
        targetId: email, targetLabel: email || "Google Drive", after: { email },
      });
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
  // loadActor too: refuses stale (pre-password-change) and locked sessions.
  const { loadActor } = require("../../middleware/permissionMiddleware");
  const { createDriveConnectState } = require("../../utils/driveConnectState");
  return createGoogleDriveRouter({
    drive: require("../../services/googleDrive.service"),
    state: createDriveConnectState(),
    requireAuth: [requireAuth, loadActor],
    audit: require("../../utils/audit").audit,
  });
}

module.exports = defaultRouter();
module.exports.createGoogleDriveRouter = createGoogleDriveRouter;
module.exports.isSystemAccount = isSystemAccount;
