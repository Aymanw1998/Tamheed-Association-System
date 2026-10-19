// The system account's password rules (spec الجزء 6): a change every 30 days,
// a temporary password that only ever travels to SYSTEM_ADMIN_EMAIL, and the
// emails sent to that mailbox. Pure functions except resetSystemPassword,
// which takes every side effect as an argument.
const crypto = require("crypto");

const PASSWORD_MAX_AGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const PASSWORD_CHANGE_SCOPE = "password-change";
const PASSWORD_CHANGE_TOKEN_TTL_SEC = 15 * 60;
const RECOVERY_MIN_FAILURES = 3;
const RECOVERY_COOLDOWN_MS = 10 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const TEMP_PASSWORD_LENGTH = 16;
// No < > & " ': the password is placed in an HTML email body as is.
const TEMP_PASSWORD_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^*-_=+?";

const toTime = (value) => {
  if (!value) return NaN;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : NaN;
};

// System account only. A missing or unreadable date counts as expired.
function mustChangePassword(user, { isSystem, now = new Date() } = {}) {
  if (!isSystem) return false;
  const changed = toTime(user?.passwordChangedAt);
  if (Number.isNaN(changed) || changed <= 0) return true;
  return new Date(now).getTime() - changed >= PASSWORD_MAX_AGE_DAYS * DAY_MS;
}

// Sessions end when the password changes or the account is recovered: a token
// signed (iat, in seconds) before either is refused. Whole seconds, so the
// token issued in the same second as the change still works.
function tokenIsStale(iat, user) {
  if (typeof iat !== "number" || !Number.isFinite(iat)) return false;
  const latest = Math.max(
    ...[user?.passwordChangedAt, user?.recoveredAt].map(toTime).filter((t) => !Number.isNaN(t)),
    0,
  );
  return iat < Math.floor(latest / 1000);
}

// True while a recovery happened less than 10 minutes ago.
function recoveryCoolingDown(user, now = new Date()) {
  const last = toTime(user?.recoveredAt);
  return !Number.isNaN(last) && new Date(now).getTime() - last < RECOVERY_COOLDOWN_MS;
}

function generateTempPassword(randomInt = crypto.randomInt) {
  let out = "";
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i += 1) {
    out += TEMP_PASSWORD_CHARSET[randomInt(TEMP_PASSWORD_CHARSET.length)];
  }
  return out;
}

// Null when acceptable, else an error code for the client.
function newPasswordProblem(newPassword, currentPassword) {
  if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LENGTH) return "PASSWORD_TOO_SHORT";
  if (newPassword.length > MAX_PASSWORD_LENGTH) return "PASSWORD_TOO_LONG";
  if (newPassword === currentPassword) return "PASSWORD_SAME";
  return null;
}

// Readable Arabic text for newPasswordProblem codes, worded like the client's
// passwordChange.errors (client/src/i18n/accessStrings.js).
const PASSWORD_PROBLEM_MESSAGES = {
  PASSWORD_TOO_SHORT: `كلمة المرور الجديدة قصيرة جدًا (${MIN_PASSWORD_LENGTH} أحرف على الأقل).`,
  PASSWORD_TOO_LONG: `كلمة المرور الجديدة طويلة جدًا (${MAX_PASSWORD_LENGTH} حرفًا على الأكثر).`,
  PASSWORD_SAME: "كلمة المرور الجديدة يجب أن تختلف عن الحالية.",
};
const passwordProblemMessage = (code) => PASSWORD_PROBLEM_MESSAGES[code] || "كلمة المرور الجديدة غير صالحة.";

// A placeholder (blank, or the ".local" default) cannot receive mail.
function isUsableSystemEmail(email) {
  const value = String(email ?? "").trim().toLowerCase();
  return Boolean(value) && value.includes("@") && !value.endsWith(".local");
}

function systemEmailWarning(email) {
  if (isUsableSystemEmail(email)) return null;
  return "SYSTEM_ADMIN_EMAIL is blank or a placeholder (.local): system account recovery and alert emails "
    + "cannot be delivered. Set a real mailbox in server/config/.env and restart.";
}

// "owner@example.org" -> "o***@e***.org". Safe to print.
function maskEmail(email) {
  const value = String(email ?? "").trim();
  const at = value.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  const host = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  return `${local[0]}***@${host[0] || ""}***${tld}`;
}

function passwordChangedAtPatch(user, now = new Date()) {
  return Number.isNaN(toTime(user?.passwordChangedAt)) ? { passwordChangedAt: now } : {};
}

function tempPasswordEmail(tempPassword) {
  const subject = "Tamheed: temporary password for the system account";
  const text = [
    "A temporary password was set for the Tamheed system account.",
    "تم تعيين كلمة مرور مؤقتة لحساب النظام في تمهيد.",
    "",
    `Temporary password / كلمة المرور المؤقتة: ${tempPassword}`,
    "",
    "Sign in with it; you will be asked to choose a new password right away.",
    "سجّل الدخول بها، وسيُطلب منك اختيار كلمة مرور جديدة فورًا.",
  ].join("\n");
  const html = `<div style="font-family:Arial;line-height:1.6">
<p>A temporary password was set for the Tamheed system account.</p>
<p dir="rtl">تم تعيين كلمة مرور مؤقتة لحساب النظام في تمهيد.</p>
<div style="font-size:22px;font-weight:700;letter-spacing:2px;font-family:monospace">${tempPassword}</div>
<p>Sign in with it; you will be asked to choose a new password right away.</p>
<p dir="rtl">سجّل الدخول بها، وسيُطلب منك اختيار كلمة مرور جديدة فورًا.</p>
</div>`;
  return { subject, text, html };
}

function lockoutAlertEmail(failedLoginCount) {
  const subject = "5 failed sign-in attempts on the system account";
  const text = [
    "5 failed sign-in attempts on the system account.",
    "5 محاولات دخول فاشلة متتالية لحساب النظام.",
    "",
    `Consecutive failures so far / عدد المحاولات الفاشلة المتتالية: ${Number(failedLoginCount) || 0}`,
    "The account is not locked. If this was not you, change the password.",
    "الحساب غير محظور. إن لم تكن أنت، غيّر كلمة المرور.",
  ].join("\n");
  return { subject, text, html: `<pre style="font-family:Arial">${text}</pre>` };
}

// Shared by POST /api/user/system/recover and scripts/systemRecover.js.
// The email goes first: if it cannot be sent, nothing is changed and the
// current password keeps working.
async function resetSystemPassword({ user, model, room = "active", email, send, encrypt, generate = generateTempPassword }) {
  const tempPassword = generate();
  await send(String(email).trim(), tempPasswordEmail(tempPassword));
  const patch = {
    password: encrypt(tempPassword),
    passwordChangedAt: new Date(0),
    failedLoginCount: 0,
    lockedAt: null,
    refreshHash: null,
    // Ends every session signed before now (tokenIsStale) and starts the cooldown.
    recoveredAt: new Date(),
  };
  await model.update({ tz: user.tz }, patch, room);
  return {
    before: {
      tz: user.tz, firstname: user.firstname, lastname: user.lastname,
      failedLoginCount: Number(user.failedLoginCount) || 0,
      passwordChangedAt: user.passwordChangedAt ?? null,
    },
    after: {
      tz: user.tz, firstname: user.firstname, lastname: user.lastname,
      failedLoginCount: 0, passwordChangedAt: patch.passwordChangedAt, password: "***",
    },
  };
}

module.exports = {
  PASSWORD_MAX_AGE_DAYS,
  PASSWORD_CHANGE_SCOPE,
  PASSWORD_CHANGE_TOKEN_TTL_SEC,
  RECOVERY_MIN_FAILURES,
  RECOVERY_COOLDOWN_MS,
  MIN_PASSWORD_LENGTH,
  TEMP_PASSWORD_CHARSET,
  mustChangePassword,
  tokenIsStale,
  recoveryCoolingDown,
  generateTempPassword,
  newPasswordProblem,
  passwordProblemMessage,
  isUsableSystemEmail,
  systemEmailWarning,
  maskEmail,
  passwordChangedAtPatch,
  tempPasswordEmail,
  lockoutAlertEmail,
  resetSystemPassword,
};
