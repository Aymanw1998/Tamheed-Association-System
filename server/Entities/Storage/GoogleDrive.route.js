// Links the whole app to a single Google Drive account. Connecting is an IT
// action (IT-site design, 2026-11-03): the IT site asks for a connect URL
// (POST /api/it/storage/google/connect-url, its own session) and gets back
// Google's consent URL carrying a one-time state. Google's callback stays on
// /api/storage/google/callback: it is a plain browser redirect, so it is
// accepted only with a state this server issued, once, within 10 minutes.
const express = require("express");
const { can, isSystemTz } = require("../../utils/permissions");

const DONE_PATH = "/files?drive=";
// Where a flow started on the IT site lands after Google (its storage screen).
const IT_DONE_PATH = "/storage?drive=";

// The signed access token carries tz, so this needs no database read.
// An unset SYSTEM_ADMIN_TZ matches nobody. Kept as an exported name over the
// shared isSystemTz rule.
function isSystemAccount(user, systemTz = process.env.SYSTEM_ADMIN_TZ) {
  return isSystemTz(user?.tz, systemTz);
}

const noAudit = { record: async () => {} };

// The site the flow started on: the IT site's own address when IT_HOST is set.
function donePath(site) {
  const host = String(process.env.IT_HOST || "").trim();
  return site === "it" && host ? `https://${host}${IT_DONE_PATH}` : DONE_PATH;
}

// withCallback: Google's redirect (everyday mount). withConnect: connect-url
// and status behind requireAuth (the IT mount, requireIt, site "it").
function createGoogleDriveRouter({
  drive, state, requireAuth, isSystemAccount: isSystem = isSystemAccount, audit = noAudit,
  withCallback = true, withConnect = true, site = "app",
}) {
  const router = express.Router();

  // req.actor (requireIt / loadActor), else the signed token's req.user.
  const who = (req) => req.actor || req.user || {};
  const mayConnect = (req) => isSystem(who(req)) || can(req.actor?.permissions, "storage.drive");
  const requireDriveAccess = (req, res, next) =>
    mayConnect(req)
      ? next()
      : res.status(403).json({ code: "FORBIDDEN", message: "ربط Google Drive متاح لحساب النظام ولمن منحه الصلاحية" });

  if (withConnect) {
    router.post("/connect-url", requireAuth, requireDriveAccess, express.json(), (req, res) => {
      try {
        // The callback is a public redirect with no signed-in user, so the state
        // carries who started the flow (for the audit log) and on which site.
        const actor = who(req);
        const tz = String(actor.tz || "");
        const token = state.issue(actor.id, Date.now(), { tz, name: actor.name || tz, isSystem: isSystem(actor), site });
        return res.json({ ok: true, url: drive.getAuthUrl(token, { fullAccess: req.body?.fullAccess === true }) });
      } catch (err) {
        return res.status(500).json({ ok: false, message: err.message });
      }
    });

    router.get("/status", requireAuth, async (req, res) => {
      try {
        const status = await drive.getStatus();
        return res.json({ ok: true, ...status, canConnect: mayConnect(req) });
      } catch (err) {
        return res.status(500).json({ ok: false, message: err.message });
      }
    });
  }

  if (withCallback) {
    router.get("/callback", async (req, res) => {
      const { code, error, state: stateToken } = req.query;
      const issued = state.consume(String(stateToken || ""));
      if (!issued) return res.redirect(`${DONE_PATH}denied`);
      const done = donePath(issued.actor?.site);
      if (error || !code) return res.redirect(`${done}error`);
      try {
        const connected = await drive.handleOAuthCallback(String(code));
        const email = String(connected?.email || "");
        const { site: _site, ...actor } = issued.actor || { tz: "", isSystem: true };
        await audit.record({ actor, ip: req.ip }, {
          module: "files", action: "drive_connect", targetType: "drive",
          targetId: email, targetLabel: email || "Google Drive", after: { email },
        });
        return res.redirect(`${done}connected`);
      } catch (err) {
        console.error("[GoogleDrive] connect failed:", err.message);
        return res.redirect(`${done}error`);
      }
    });
  }

  return router;
}

// One state store for both mounts: the IT site issues, the callback consumes.
let sharedState = null;
function driveState() {
  if (!sharedState) sharedState = require("../../utils/driveConnectState").createDriveConnectState();
  return sharedState;
}

// The everyday mount (/api/storage/google): Google's callback only.
function defaultRouter() {
  return createGoogleDriveRouter({
    drive: require("../../services/googleDrive.service"),
    state: driveState(),
    audit: require("../../utils/audit").audit,
    withConnect: false,
  });
}

module.exports = defaultRouter();
module.exports.createGoogleDriveRouter = createGoogleDriveRouter;
module.exports.isSystemAccount = isSystemAccount;
module.exports.driveState = driveState;
