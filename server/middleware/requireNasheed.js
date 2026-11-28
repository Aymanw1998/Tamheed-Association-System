// The nasheed site's session (owner, 2026-11-27): its own cookie, signed with
// its own secret, accepted only on NASHEED_HOST, and only for an active staff
// member who holds nasheeds.manage now. Never the everyday Authorization
// header or refresh cookie, and never the system account.
const jwt = require("jsonwebtoken");
const { isSportHost } = require("../utils/sportHost");
const { isSystemTz, effectivePermissions } = require("../utils/permissions");
const { isLocked } = require("../utils/loginLockout");
const { tokenIsStale, mustChangePassword } = require("../utils/systemPassword");
const { logWithSource } = require("./logger");

const NASHEED_COOKIE = "nasheed_session";
const NASHEED_COOKIE_PATH = "/api/nasheed";
const NASHEED_SESSION_TYP = "nasheed";
const NASHEED_SESSION_MS = 12 * 60 * 60 * 1000;
const MANAGE_KEY = "nasheeds.manage";
const NO_SECRET = "NASHEED_SESSION_SECRET is not set";
const SIGNED_OUT = { ok: false, code: "NASHEED_SIGNED_OUT", message: "انتهت الجلسة، سجّل الدخول من جديد" };
const SERVER_ERROR = { ok: false, message: "حدث خطأ غير متوقع، حاول مرة أخرى" };

// Fails closed: there is no fallback to any other secret.
function nasheedSecret() {
  const value = process.env.NASHEED_SESSION_SECRET;
  if (!value) throw new Error(NO_SECRET);
  return value;
}

// Host-only (no domain); secure in production, like the IT cookie.
const nasheedCookieOptions = () => ({
  httpOnly: true,
  sameSite: "Strict",
  secure: process.env.NODE_ENV === "production",
  path: NASHEED_COOKIE_PATH,
});

// No NASHEED_HOST means no nasheed site at all.
const isNasheedHost = (req) => isSportHost(req, process.env.NASHEED_HOST);
const notHere = (res) => res.status(404).json({ ok: false, message: "غير موجود" });

function requireNasheedHost(req, res, next) {
  return isNasheedHost(req) ? next() : notHere(res);
}

// Who may manage the nasheeds now: an active, unlocked staff member (not the
// system account) holding the key, with no password change pending.
function mayManage(user, { systemTz } = {}) {
  if (!user || isSystemTz(String(user.tz || ""), systemTz)) return false;
  if (isLocked(user, { isSystem: false }) || mustChangePassword(user, { isSystem: false })) return false;
  return effectivePermissions(user).has(MANAGE_KEY);
}

const fullName = (user) => `${user?.firstname || ""} ${user?.lastname || ""}`.trim();

// Loaded lazily so requiring this file does not pull in the database layer.
const defaultUsers = () => require("../Entities/User/User.model").UserModelDef;

function createRequireNasheed(deps = {}) {
  const { users, systemTz = () => process.env.SYSTEM_ADMIN_TZ, log = logWithSource } = deps;

  // Read from the active room on every request, so a suspension, a lock or a
  // revoked key ends the session at once.
  const findActiveUser = async (tz) => {
    const found = await (users || defaultUsers()).get({ tz }, "active");
    return found?.success && Array.isArray(found.result) && found.result.length === 1 ? found.result[0] : null;
  };

  return async function requireNasheed(req, res, next) {
    if (!isNasheedHost(req)) return notHere(res);
    const refuse = () => res.status(401).json(SIGNED_OUT);
    try {
      const key = nasheedSecret();
      const token = req.cookies?.[NASHEED_COOKIE];
      if (!token) return refuse();
      let payload;
      try {
        payload = jwt.verify(token, key, { algorithms: ["HS256"] });
      } catch {
        return refuse();
      }
      if (payload?.typ !== NASHEED_SESSION_TYP || !payload.sub) return refuse();
      const user = await findActiveUser(String(payload.sub));
      if (!mayManage(user, { systemTz: systemTz() }) || tokenIsStale(payload.iat, user)) return refuse();
      req.actor = {
        id: String(user._id ?? ""),
        tz: String(user.tz || ""),
        name: fullName(user),
        permissions: effectivePermissions(user),
        user,
      };
      return next();
    } catch (err) {
      log("requireNasheed", err);
      return res.status(500).json(SERVER_ERROR);
    }
  };
}

module.exports = {
  NASHEED_COOKIE,
  NASHEED_COOKIE_PATH,
  NASHEED_SESSION_TYP,
  NASHEED_SESSION_MS,
  MANAGE_KEY,
  nasheedSecret,
  nasheedCookieOptions,
  isNasheedHost,
  requireNasheedHost,
  mayManage,
  fullName,
  createRequireNasheed,
  requireNasheed: createRequireNasheed(),
};
