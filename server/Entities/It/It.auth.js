// IT site sign-in (IT-site design, "Sign-in"): the everyday password, then a
// one-time code by email, then the IT site's own session (middleware/requireIt).
const jwt = require("jsonwebtoken");
const { ItLoginCodeModelDef } = require("./ItLoginCode.model");
const { sha256 } = require("../../utils/jwt");
const { generateOtp6 } = require("../../utils/otp");
const sendEmail = require("../../utils/sendEmail");
const { isSystemTz, hasRealEmail } = require("../../utils/permissions");
const { isLocked, afterSuccess } = require("../../utils/loginLockout");
const { mustChangePassword, isUsableSystemEmail } = require("../../utils/systemPassword");
const { audit: defaultAudit } = require("../../utils/audit");
const { logWithSource } = require("../../middleware/logger");
const {
  IT_COOKIE, IT_SESSION_TYP, IT_SESSION_MS, itSecret, itCookieOptions, mayUseIt,
} = require("../../middleware/requireIt");

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const GENERIC_LOGIN_MESSAGE = "إذا كانت البيانات صحيحة، سيصلك رمز دخول إلى بريدك الإلكتروني.";
const BAD_CODE_MESSAGE = "الرمز غير صحيح أو انتهت صلاحيته";
const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";

const rows = (r) => (r?.success && Array.isArray(r.result) ? r.result : []);

// The alert on every sign-in of the system account. No ID number in it.
function systemSignInEmail({ at, ip }) {
  const when = new Date(at).toISOString();
  const subject = "Sign-in to the IT site with the system account";
  const text = [
    "The system account signed in to the Tamheed IT site.",
    "تم تسجيل الدخول إلى موقع قسم IT في تمهيد بحساب النظام.",
    "",
    `Time / الوقت: ${when}`,
    `IP / العنوان: ${String(ip || "-")}`,
    "",
    "If this was not you, change the password now.",
    "إن لم تكن أنت، غيّر كلمة المرور فورًا.",
  ].join("\n");
  return { subject, text, html: `<pre style="font-family:Arial">${text}</pre>` };
}

// Loaded on first use, so requiring this file does not pull in the controller.
const userController = () => require("../User/User.controller");
const defaultUsers = () => require("../User/User.model").UserModelDef;

// Dependencies are injectable so the flow can be tested without a database.
function createItAuth(deps = {}) {
  const {
    users,
    codes = ItLoginCodeModelDef,
    verifyPassword = (user, room, password) => userController().verifyPasswordAndMaybeUpgrade(user, room, password),
    countFailure = (req, user, room, isSystem) => userController().countFailedSignIn(req, user, room, isSystem),
    clearFailures = (user) => (users || defaultUsers()).update({ tz: user.tz }, afterSuccess(), "active"),
    sendCode = sendEmail.sendItLoginCodeEmail,
    sendAlert = sendEmail.sendSystemAdminEmail,
    audit = defaultAudit,
    makeCode = generateOtp6,
    systemTz = () => process.env.SYSTEM_ADMIN_TZ,
    systemEmail = () => process.env.SYSTEM_ADMIN_EMAIL,
    log = logWithSource,
    now = () => Date.now(),
  } = deps;

  const findActiveUser = async (tz) => {
    const found = rows(await (users || defaultUsers()).get({ tz }, "active"));
    return found.length === 1 ? found[0] : null;
  };

  // Where this user's code goes: SYSTEM_ADMIN_EMAIL for the system account,
  // else the user's own real email. Null when there is none.
  const mailboxOf = (user, isSystem) => {
    if (isSystem) {
      const email = String(systemEmail() || "").trim();
      return isUsableSystemEmail(email) ? email : null;
    }
    return hasRealEmail(user) ? String(user.email).trim() : null;
  };

  // iat is set from now() (not the system clock), like every other time here.
  const startSession = (res, tz, key) => {
    const token = jwt.sign({ sub: String(tz), typ: IT_SESSION_TYP, iat: Math.floor(now() / 1000) }, key, {
      algorithm: "HS256",
      expiresIn: Math.floor(IT_SESSION_MS / 1000),
    });
    res.cookie(IT_COOKIE, token, { ...itCookieOptions(), maxAge: IT_SESSION_MS });
  };

  // POST /api/it/login { tz, password }: always the same answer, so it never
  // tells whether the account exists, is IT, or why no code came.
  const login = async (req, res) => {
    const generic = () => res.json({ ok: true, message: GENERIC_LOGIN_MESSAGE });
    try {
      const tz = String(req.body?.tz ?? "").trim();
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!tz || !password) return generic();
      itSecret(); // fails closed before any code is created or sent

      const user = await findActiveUser(tz);
      if (!user) return generic();
      const isSystem = isSystemTz(String(user.tz || ""), systemTz());
      // A locked account is refused before the password is even checked.
      if (isLocked(user, { isSystem })) return generic();

      const { ok } = await verifyPassword(user, "active", password);
      if (!ok) {
        await countFailure(req, user, "active", isSystem);
        return generic();
      }
      if (Number(user.failedLoginCount) > 0) await clearFailures(user);

      // An expired system password is changed through the everyday sign-in first.
      if (mustChangePassword(user, { isSystem, now: new Date(now()) })) return generic();
      if (!mayUseIt(user, isSystem)) return generic();
      const to = mailboxOf(user, isSystem);
      if (!to) return generic();

      const code = makeCode();
      await codes.update({ userTz: user.tz }, {
        userTz: user.tz,
        codeHash: sha256(code),
        expiresAt: new Date(now() + CODE_TTL_MS),
        attempts: 0,
      });
      // Not awaited: SMTP must not delay or change the answer.
      Promise.resolve()
        .then(() => sendCode(to, code))
        .catch((e) => log("It.login", e));
      return generic();
    } catch (err) {
      log("It.login", err);
      return generic();
    }
  };

  // POST /api/it/verify { tz, code }: the code is single-use and ends after
  // five wrong tries; the right one sets the IT cookie.
  const verify = async (req, res) => {
    const bad = () => res.status(400).json({ ok: false, message: BAD_CODE_MESSAGE });
    try {
      const tz = String(req.body?.tz ?? "").trim();
      const code = String(req.body?.code ?? "").trim();
      const key = itSecret();
      if (!tz || !/^[0-9]{6}$/.test(code)) return bad();

      const stored = rows(await codes.get({ userTz: tz }))[0];
      if (!stored?.codeHash) return bad();
      if (new Date(stored.expiresAt).getTime() <= now()) {
        await codes.delete({ userTz: tz });
        return bad();
      }
      if (sha256(code) !== stored.codeHash) {
        // Atomic $inc: concurrent guesses each count.
        const after = await codes.increment({ userTz: tz }, "attempts", 1);
        if (Number(after?.result?.attempts) >= MAX_ATTEMPTS) await codes.delete({ userTz: tz });
        return bad();
      }
      // Only the request that removes the code may use it.
      const used = await codes.delete({ userTz: tz, codeHash: stored.codeHash });
      if (Number(used?.result?.deletedCount) !== 1) return bad();

      // Read again: a block or removal since the code was sent wins.
      const user = await findActiveUser(tz);
      const isSystem = Boolean(user) && isSystemTz(String(user.tz || ""), systemTz());
      if (!user || !mayUseIt(user, isSystem) || isLocked(user, { isSystem })) return bad();

      startSession(res, user.tz, key);
      if (isSystem) {
        // Not awaited: a failed alert must not fail the sign-in.
        const to = mailboxOf(user, true);
        Promise.resolve()
          .then(() => (to ? sendAlert(to, systemSignInEmail({ at: now(), ip: req.ip })) : null))
          .catch((e) => log("It.systemSignInAlert", e));
        await audit.record({ actor: { isSystem: true }, ip: req.ip }, {
          module: "it", action: "sign_in", targetType: "user", targetId: user.tz,
        });
      }
      return res.json({ ok: true });
    } catch (err) {
      log("It.verify", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  const logout = (req, res) => {
    res.clearCookie(IT_COOKIE, itCookieOptions());
    return res.json({ ok: true });
  };

  // GET /api/it/me (after requireIt).
  const me = (req, res) => {
    const { tz, name, isSystem, user } = req.actor;
    return res.json({ ok: true, tz, name, isSystem, photo: user?.photo || null });
  };

  return { login, verify, logout, me };
}

module.exports = {
  ...createItAuth(),
  createItAuth,
  systemSignInEmail,
  GENERIC_LOGIN_MESSAGE,
  BAD_CODE_MESSAGE,
};
