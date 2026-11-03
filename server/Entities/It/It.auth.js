// IT site sign-in (IT-site design, "Sign-in"): the everyday password, then a
// one-time code by email, then the IT site's own session (middleware/requireIt).
const jwt = require("jsonwebtoken");
const { ItLoginCodeModelDef } = require("./ItLoginCode.model");
const { sha256 } = require("../../utils/jwt");
const { generateOtp6 } = require("../../utils/otp");
const sendEmail = require("../../utils/sendEmail");
const { isSystemTz, hasRealEmail, resolveRole } = require("../../utils/permissions");
const { isLocked, afterSuccess } = require("../../utils/loginLockout");
const { mustChangePassword, isUsableSystemEmail, newPasswordProblem } = require("../../utils/systemPassword");
const { audit: defaultAudit } = require("../../utils/audit");
const { logWithSource } = require("../../middleware/logger");
const {
  IT_COOKIE, IT_SESSION_TYP, IT_SESSION_MS, itSecret, itCookieOptions, mayUseIt,
} = require("../../middleware/requireIt");

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const GENERIC_LOGIN_MESSAGE = "إذا كانت البيانات صحيحة، سيصلك رمز دخول إلى بريدك الإلكتروني.";
const CODE_SENT_MESSAGE = "أُرسل رمز الدخول إلى بريدك الإلكتروني.";

// Why the password step did not lead to a code (POST /api/it/login).
const LOGIN_REFUSALS = {
  BAD_LOGIN: { status: 401, message: "رقم الهوية أو كلمة المرور غير صحيحة" },
  LOCKED: { status: 423, message: "الحساب مقفل بعد محاولات دخول فاشلة. توجّه إلى قسم IT لفتحه." },
  NO_IT_ACCESS: { status: 403, message: "ليس لديك وصول إلى موقع قسم IT" },
  NO_EMAIL: { status: 403, message: "لا يوجد بريد إلكتروني صالح في حسابك لإرسال الرمز. توجّه إلى حساب النظام." },
  SYSTEM_PASSWORD_CHANGE: { status: 403, message: "يجب أولًا تغيير كلمة مرور حساب النظام في الموقع الرئيسي" },
  TOO_MANY_CODES: { status: 429, message: "محاولات كثيرة للرمز. حاول مرة أخرى بعد 10 دقائق." },
};
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
    encryptPassword = (plain) => require("../User/passwordCrypto").encryptPassword(plain),
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

  // The account a sign-in may go on with: one in the active room, not locked.
  const signInUser = async (tz) => {
    const user = await findActiveUser(tz);
    if (!user) return null;
    const isSystem = isSystemTz(String(user.tz || ""), systemTz());
    return isLocked(user, { isSystem }) ? null : { user, isSystem };
  };

  // Everything after the password step, shared by the password login and the
  // one-time pass from the everyday app (sitePass.js): sends a code only when
  // every gate allows. Returns "sent", or the reason no code was sent (a key
  // of LOGIN_REFUSALS).
  const sendCodeAfterPassword = async (user, isSystem) => {
    // The system account's first (or recovered) password is changed through
    // the everyday sign-in first. A new IT user's temporary password is
    // changed on the IT site, right after this code (changePassword below).
    if (isSystem && mustChangePassword(user, { isSystem, now: new Date(now()) })) return "SYSTEM_PASSWORD_CHANGE";
    if (!mayUseIt(user, isSystem)) return "NO_IT_ACCESS";
    const to = mailboxOf(user, isSystem);
    if (!to) return "NO_EMAIL";

    // Wrong tries live as long as the row: a new code keeps them, and after
    // five no code is sent until the row expires. At most five guesses per
    // account per ten minutes.
    const existing = rows(await codes.get({ userTz: user.tz }))[0];
    const live = existing && new Date(existing.expiresAt).getTime() > now();
    const attempts = live ? Number(existing.attempts) || 0 : 0;
    if (attempts >= MAX_ATTEMPTS) return "TOO_MANY_CODES";

    const code = makeCode();
    await codes.update({ userTz: user.tz }, {
      userTz: user.tz,
      codeHash: sha256(code),
      expiresAt: new Date(now() + CODE_TTL_MS),
      attempts,
    });
    // Not awaited: SMTP must not delay or change the answer.
    Promise.resolve()
      .then(() => sendCode(to, code))
      .catch((e) => log("It.login", e));
    return "sent";
  };

  // POST /api/it/login { tz, password }: the code step comes only after a
  // right ID number and password (owner, 2026-11-03). A wrong pair, an
  // unknown ID number and a missing one get the same answer; with the right
  // pair the answer says why no code was sent.
  const login = async (req, res) => {
    const refuse = (code) => res.status(LOGIN_REFUSALS[code].status).json({ ok: false, code, message: LOGIN_REFUSALS[code].message });
    try {
      const tz = String(req.body?.tz ?? "").trim();
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      if (!tz || !password) return refuse("BAD_LOGIN");
      itSecret(); // fails closed before any code is created or sent

      const user = await findActiveUser(tz);
      if (!user) return refuse("BAD_LOGIN");
      const isSystem = isSystemTz(String(user.tz || ""), systemTz());
      // A locked account is refused before the password is even checked.
      if (isLocked(user, { isSystem })) return refuse("LOCKED");

      const { ok } = await verifyPassword(user, "active", password);
      if (!ok) {
        await countFailure(req, user, "active", isSystem);
        return refuse("BAD_LOGIN");
      }
      if (Number(user.failedLoginCount) > 0) await clearFailures(user);

      const outcome = await sendCodeAfterPassword(user, isSystem);
      if (outcome !== "sent") return refuse(outcome);
      return res.json({ ok: true, message: CODE_SENT_MESSAGE });
    } catch (err) {
      log("It.login", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  // The password step done another way (a one-time pass): the same gates and
  // the same code as login. Throws when IT_SESSION_SECRET is missing.
  const sendCodeWithoutPassword = async (tz) => {
    itSecret();
    const found = await signInUser(String(tz ?? "").trim());
    if (found) await sendCodeAfterPassword(found.user, found.isSystem);
  };

  // The last step of every IT sign-in (the email code, a passkey): the user
  // read again must still be IT, not blocked and not locked (an expired system
  // password is changed on the everyday site first). Sets the IT cookie and,
  // for the system account, sends the alert and writes the audit row. False
  // when the sign-in may not finish.
  const completeSignIn = async (req, res, tz, { needsFreshPassword = false } = {}) => {
    const key = itSecret();
    const user = await findActiveUser(String(tz ?? "").trim());
    const isSystem = Boolean(user) && isSystemTz(String(user.tz || ""), systemTz());
    if (!user || !mayUseIt(user, isSystem) || isLocked(user, { isSystem })) return false;
    if (needsFreshPassword && mustChangePassword(user, { isSystem, now: new Date(now()) })) return false;

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
    return true;
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
        // Ended, not deleted: the row (and its count) stays until it expires.
        if (Number(after?.result?.attempts) >= MAX_ATTEMPTS) await codes.updateExisting({ userTz: tz }, { codeHash: null });
        // A wrong code counts as a failed sign-in, like a wrong password.
        const user = await findActiveUser(tz);
        if (user) await countFailure(req, user, "active", isSystemTz(String(user.tz || ""), systemTz()));
        return bad();
      }
      // Only the request that removes the code may use it.
      const used = await codes.delete({ userTz: tz, codeHash: stored.codeHash });
      if (Number(used?.result?.deletedCount) !== 1) return bad();

      // Read again: a block or removal since the code was sent wins.
      if (!(await completeSignIn(req, res, tz))) return bad();
      return res.json({ ok: true });
    } catch (err) {
      log("It.verify", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  // POST /api/it/change-password { newPassword } (requireIt): only while the
  // user must change his temporary password; signing in with it and the
  // email code is the proof, so the old one is not asked again. The IT
  // session goes on with a new cookie.
  const changePassword = async (req, res) => {
    try {
      const user = req.actor?.user;
      if (!req.actor?.mustChangePassword || !user?.tz) return res.status(403).json({ ok: false, code: "FORBIDDEN" });
      const newPassword = req.body?.newPassword;
      const problem = newPasswordProblem(newPassword);
      if (problem) return res.status(400).json({ ok: false, code: problem });
      const key = itSecret();
      await (users || defaultUsers()).update({ tz: user.tz }, {
        password: encryptPassword(newPassword),
        passwordChangedAt: new Date(now()),
        mustChangePassword: false,
      }, "active");
      await audit.record(req, { module: "users", action: "password_change", targetType: "user", targetId: user.tz });
      startSession(res, user.tz, key);
      return res.json({ ok: true });
    } catch (err) {
      log("It.changePassword", err);
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
    // hasEverydayRole: the pass routes' condition, so the site can show «النظام» without asking for a pass.
    return res.json({
      ok: true, tz, name, isSystem, photo: user?.photo || null, hasEverydayRole: Boolean(resolveRole(user)),
      // The site shows only «تغيير كلمة المرور» until it is changed (requireIt refuses the rest).
      mustChangePassword: Boolean(req.actor.mustChangePassword),
      // «مستخدمو IT»: the system account and the managers it named.
      isItManager: isSystem === true || user?.itManager === true,
    });
  };

  return { login, verify, logout, me, changePassword, sendCodeWithoutPassword, completeSignIn };
}

module.exports = {
  ...createItAuth(),
  createItAuth,
  systemSignInEmail,
  GENERIC_LOGIN_MESSAGE,
  CODE_SENT_MESSAGE,
  LOGIN_REFUSALS,
  BAD_CODE_MESSAGE,
};
