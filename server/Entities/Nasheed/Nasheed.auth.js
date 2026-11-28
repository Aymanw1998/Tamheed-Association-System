// The nasheed site's sign-in (owner, 2026-11-27): the everyday Tamheed ID
// number and password, then the site's own session (middleware/requireNasheed).
// No email code: the site holds nasheed words only. Only a staff member who
// holds nasheeds.manage gets in; the system account never does.
const jwt = require("jsonwebtoken");
const { isSystemTz, effectivePermissions } = require("../../utils/permissions");
const { isLocked, afterSuccess, LOCKED_MESSAGE } = require("../../utils/loginLockout");
const { mustChangePassword } = require("../../utils/systemPassword");
const { logWithSource } = require("../../middleware/logger");
const {
  NASHEED_COOKIE, NASHEED_SESSION_TYP, NASHEED_SESSION_MS, MANAGE_KEY,
  nasheedSecret, nasheedCookieOptions, fullName,
} = require("../../middleware/requireNasheed");

// Why the sign-in did not start a session (POST /api/nasheed/login).
const LOGIN_REFUSALS = {
  BAD_LOGIN: { status: 401, message: "رقم الهوية أو كلمة المرور غير صحيحة" },
  LOCKED: { status: 423, message: LOCKED_MESSAGE },
  NO_ACCESS: { status: 403, message: "ليس لديك صلاحية إدارة الأناشيد" },
  PASSWORD_CHANGE: { status: 403, message: "يجب تغيير كلمة المرور أولًا في النظام الرئيسي" },
};
const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";

const rows = (r) => (r?.success && Array.isArray(r.result) ? r.result : []);
const userController = () => require("../User/User.controller");
const defaultUsers = () => require("../User/User.model").UserModelDef;

function createNasheedAuth(deps = {}) {
  const {
    users,
    verifyPassword = (user, room, password) => userController().verifyPasswordAndMaybeUpgrade(user, room, password),
    countFailure = (req, user, room, isSystem) => userController().countFailedSignIn(req, user, room, isSystem),
    clearFailures = (user) => (users || defaultUsers()).update({ tz: user.tz }, afterSuccess(), "active"),
    systemTz = () => process.env.SYSTEM_ADMIN_TZ,
    log = logWithSource,
    now = () => Date.now(),
  } = deps;

  const findActiveUser = async (tz) => {
    const found = rows(await (users || defaultUsers()).get({ tz }, "active"));
    return found.length === 1 ? found[0] : null;
  };

  // POST /api/nasheed/login { tz, password }. A wrong pair, an unknown ID
  // number, a missing one and the system account get the same answer; with
  // the right pair the answer says why no session was started.
  const login = async (req, res) => {
    const refuse = (code) => res.status(LOGIN_REFUSALS[code].status).json({ ok: false, code, message: LOGIN_REFUSALS[code].message });
    try {
      const tz = String(req.body?.tz ?? "").trim();
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!tz || !password) return refuse("BAD_LOGIN");
      const key = nasheedSecret(); // fails closed before any password is checked

      const user = await findActiveUser(tz);
      if (!user || isSystemTz(String(user.tz || ""), systemTz())) return refuse("BAD_LOGIN");
      // A locked account is refused before the password is even checked.
      if (isLocked(user, { isSystem: false })) return refuse("LOCKED");

      const { ok } = await verifyPassword(user, "active", password);
      if (!ok) {
        await countFailure(req, user, "active", false);
        return refuse("BAD_LOGIN");
      }
      if (Number(user.failedLoginCount) > 0) await clearFailures(user);
      if (mustChangePassword(user, { isSystem: false })) return refuse("PASSWORD_CHANGE");
      if (!effectivePermissions(user).has(MANAGE_KEY)) return refuse("NO_ACCESS");

      const token = jwt.sign({ sub: String(user.tz), typ: NASHEED_SESSION_TYP, iat: Math.floor(now() / 1000) }, key, {
        algorithm: "HS256",
        expiresIn: Math.floor(NASHEED_SESSION_MS / 1000),
      });
      res.cookie(NASHEED_COOKIE, token, { ...nasheedCookieOptions(), maxAge: NASHEED_SESSION_MS });
      return res.json({ ok: true, user: { name: fullName(user) } });
    } catch (err) {
      log("Nasheed.login", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  // GET /api/nasheed/me (requireNasheed).
  const me = async (req, res) => res.json({ ok: true, user: { name: req.actor?.name || "" } });

  // POST /api/nasheed/logout: no session needed to clear the cookie.
  const logout = async (req, res) => {
    res.clearCookie(NASHEED_COOKIE, nasheedCookieOptions());
    return res.json({ ok: true });
  };

  return { login, me, logout };
}

module.exports = { createNasheedAuth, LOGIN_REFUSALS, ...createNasheedAuth() };
