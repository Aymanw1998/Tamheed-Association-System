// The IT site's session (IT-site design, "Sign-in"): its own cookie, signed
// with its own secret, accepted only on IT_HOST. Never the everyday
// Authorization header or refresh cookie.
const jwt = require("jsonwebtoken");
const { isSportHost } = require("../utils/sportHost");
const { isSystemTz, isUnblockedItUser, itPermissions } = require("../utils/permissions");
const { isLocked } = require("../utils/loginLockout");
const { tokenIsStale } = require("../utils/systemPassword");
const { logWithSource } = require("./logger");

const IT_COOKIE = "it_session";
const IT_COOKIE_PATH = "/api/it";
const IT_SESSION_TYP = "it";
const IT_SESSION_MS = 12 * 60 * 60 * 1000;
const NO_SECRET = "IT_SESSION_SECRET is not set";
const SIGNED_OUT = { ok: false, code: "IT_SIGNED_OUT", message: "انتهت الجلسة، سجّل الدخول من جديد" };
const SERVER_ERROR = { ok: false, message: "حدث خطأ غير متوقع، حاول مرة أخرى" };

// Fails closed: there is no fallback to any other secret.
function itSecret() {
  const value = process.env.IT_SESSION_SECRET;
  if (!value) throw new Error(NO_SECRET);
  return value;
}

// Host-only (no domain); secure in production, like the sport cookie.
const itCookieOptions = () => ({
  httpOnly: true,
  sameSite: "Strict",
  secure: process.env.NODE_ENV === "production",
  path: IT_COOKIE_PATH,
});

// Same comparison as the sport site; no IT_HOST means no IT site at all.
const isItHost = (req) => isSportHost(req, process.env.IT_HOST);

const notHere = (res) => res.status(404).json({ ok: false, message: "غير موجود" });

// Mounted first on the /api/it router: another host never reaches a route.
function requireItHost(req, res, next) {
  return isItHost(req) ? next() : notHere(res);
}

const toTime = (value) => {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : NaN;
};

// Older (iat, whole seconds) than a password change, recovery or sign-out, or
// than the user's (re)joining, blocking or removal in IT (itSignedOutAt
// outlives an unblock).
function itTokenIsStale(iat, user) {
  if (tokenIsStale(iat, user)) return true;
  const latest = Math.max(...[user?.itSince, user?.itBlockedAt, user?.itSignedOutAt].map(toTime).filter((t) => !Number.isNaN(t)), 0);
  return typeof iat === "number" && iat < Math.floor(latest / 1000);
}

// May use the IT site now: the system account always, anyone else while IT and not blocked.
const mayUseIt = (user, isSystem) => isSystem || isUnblockedItUser(user);

// Loaded lazily so requiring this file does not pull in the database layer.
const defaultUsers = () => require("../Entities/User/User.model").UserModelDef;

function createRequireIt(deps = {}) {
  const {
    users,
    systemTz = () => process.env.SYSTEM_ADMIN_TZ,
    log = logWithSource,
  } = deps;

  // Read from the active room on every request (no cache), so a block or a
  // removal ends the session at once.
  const findActiveUser = async (tz) => {
    const found = await (users || defaultUsers()).get({ tz }, "active");
    return found?.success && Array.isArray(found.result) && found.result.length === 1 ? found.result[0] : null;
  };

  return async function requireIt(req, res, next) {
    if (!isItHost(req)) return notHere(res);
    const refuse = () => res.status(401).json(SIGNED_OUT);
    try {
      const key = itSecret();
      const token = req.cookies?.[IT_COOKIE];
      if (!token) return refuse();
      let payload;
      try {
        payload = jwt.verify(token, key, { algorithms: ["HS256"] });
      } catch {
        return refuse();
      }
      if (payload?.typ !== IT_SESSION_TYP || !payload.sub) return refuse();

      const user = await findActiveUser(String(payload.sub));
      if (!user) return refuse();
      const tz = String(user.tz || "");
      const isSystem = isSystemTz(tz, systemTz());
      if (!mayUseIt(user, isSystem) || isLocked(user, { isSystem }) || itTokenIsStale(payload.iat, user)) return refuse();

      req.actor = {
        id: String(user._id ?? ""),
        tz,
        name: `${user.firstname || ""} ${user.lastname || ""}`.trim(),
        isSystem,
        it: true,
        permissions: itPermissions(user, { isSystem }),
        user,
      };
      return next();
    } catch (err) {
      log("requireIt", err);
      return res.status(500).json(SERVER_ERROR);
    }
  };
}

module.exports = {
  IT_COOKIE,
  IT_COOKIE_PATH,
  IT_SESSION_TYP,
  IT_SESSION_MS,
  itSecret,
  itCookieOptions,
  itTokenIsStale,
  mayUseIt,
  isItHost,
  requireItHost,
  createRequireIt,
  requireIt: createRequireIt(),
};
