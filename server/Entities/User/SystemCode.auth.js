const { generateOtp6 } = require("../../utils/otp");
const { hasRealEmail, isSystemTz } = require("../../utils/permissions");
const { isUsableSystemEmail } = require("../../utils/systemPassword");
const { logWithSource } = require("../../middleware/logger");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const rows = (r) => (r?.success && Array.isArray(r.result) ? r.result : []);
const sha256 = (text) => crypto.createHash("sha256").update(String(text)).digest("hex");

// The email code in System's sign-in, for an IT user with no role and for the
// system account (owner, 2026-11-04). The same limits as the IT site's code
// (It.auth.js), in a store of its own: a code of one site never opens the other.
function createSystemCode(deps = {}) {
  const {
    codes = require("./SystemLoginCode.model").SystemLoginCodeModelDef,
    sendCode = (to, code) => require("../../utils/sendEmail").sendSystemLoginCodeEmail(to, code),
    makeCode = generateOtp6,
    mailReady = () => require("../../utils/sendEmail").smtpConfigured(),
    systemTz = () => process.env.SYSTEM_ADMIN_TZ,
    systemEmail = () => process.env.SYSTEM_ADMIN_EMAIL,
    log = logWithSource,
    now = () => Date.now(),
  } = deps;

  const mailboxOf = (user) => {
    if (isSystemTz(String(user?.tz ?? ""), systemTz())) {
      const email = String(systemEmail() || "").trim();
      return isUsableSystemEmail(email) ? email : null;
    }
    return hasRealEmail(user) ? String(user.email).trim() : null;
  };

  // "sent" | "NO_EMAIL" | "TOO_MANY_CODES". Wrong tries live as long as the row.
  const send = async (user) => {
    const to = mailboxOf(user);
    // No promise of a code that cannot arrive.
    if (!to || !mailReady()) return "NO_EMAIL";
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
    Promise.resolve().then(() => sendCode(to, code)).catch((e) => log("SystemCode.send", e));
    return "sent";
  };

  // "ok" (spent) | "wrong" (counted) | "bad" (nothing to check against).
  const check = async (tz, code) => {
    const userTz = String(tz ?? "").trim();
    const given = String(code ?? "").trim();
    if (!userTz || !/^[0-9]{6}$/.test(given)) return "bad";
    const stored = rows(await codes.get({ userTz }))[0];
    if (!stored?.codeHash) return "bad";
    if (new Date(stored.expiresAt).getTime() <= now()) {
      await codes.delete({ userTz });
      return "bad";
    }
    if (sha256(given) !== stored.codeHash) {
      const after = await codes.increment({ userTz }, "attempts", 1);
      if (Number(after?.result?.attempts) >= MAX_ATTEMPTS) await codes.updateExisting({ userTz }, { codeHash: null });
      return "wrong";
    }
    // Only the request that removes the code may use it.
    const used = await codes.delete({ userTz, codeHash: stored.codeHash });
    return Number(used?.result?.deletedCount) === 1 ? "ok" : "bad";
  };

  // Given after the right password, needed with the code. Derived secret: this
  // must never pass for a session token.
  const ticketSecret = () => {
    const key = process.env.JWT_ACCESS_SECRET;
    if (!key) throw new Error("JWT_ACCESS_SECRET is not set");
    return sha256(`system-code-ticket:${key}`);
  };
  const ticketFor = (tz) => jwt.sign(
    { sub: String(tz), iat: Math.floor(now() / 1000) },
    ticketSecret(),
    { algorithm: "HS256", expiresIn: Math.floor(CODE_TTL_MS / 1000) },
  );
  const ticketOk = (tz, ticket) => {
    if (typeof ticket !== "string" || !ticket) return false;
    try {
      const p = jwt.verify(ticket, ticketSecret(), { algorithms: ["HS256"], clockTimestamp: Math.floor(now() / 1000) });
      return p.sub === String(tz);
    } catch {
      return false;
    }
  };

  return { send, check, ticketFor, ticketOk };
}

// The one the server uses, made on first use.
let shared = null;
const systemCode = () => shared || (shared = createSystemCode());

module.exports = { createSystemCode, systemCode };
