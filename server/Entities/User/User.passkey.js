const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { logWithSource } = require("../../middleware/logger");
const { isItUser, isHiddenIt, isSystemTz, resolveRole } = require("../../utils/permissions");
const { isLocked, LOCKED_MESSAGE } = require("../../utils/loginLockout");

// Passkeys in System (owner, 2026-11-04): any user saves one while signed in;
// from then on a fingerprint or face is a full sign-in, with no ID number. As
// on the IT site (It.passkey.js), but saved apart (systemPasskeys) and bound to
// SYSTEM_HOST, so a passkey of one site works nowhere else.

const CHALLENGE_COOKIE = "tamheed_system_pk";
const COOKIE_PATH = "/api/auth";
const CHALLENGE_SEC = 5 * 60;
const MAX_PASSKEYS = 10;
const BAD_MESSAGE = "تعذّر الدخول بالبصمة. ادخل بكلمة المرور.";
const SAVE_FAILED = "تعذّر حفظ الدخول بالبصمة على هذا الجهاز";
const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";

const rows = (r) => (r?.success && Array.isArray(r.result) ? r.result : []);
const toB64 = (bytes) => Buffer.from(bytes).toString("base64url");
const fromB64 = (text) => new Uint8Array(Buffer.from(String(text), "base64url"));
// Derived, never the session secret: this cookie comes from a public route, and
// must not pass for a session token.
const challengeSecret = () => {
  const key = process.env.JWT_ACCESS_SECRET;
  if (!key) throw new Error("JWT_ACCESS_SECRET is not set");
  return crypto.createHash("sha256").update(`system-passkey:${key}`).digest("hex");
};

function defaultSite() {
  const host = process.env.SYSTEM_HOST;
  return host ? { rpID: host, origin: `https://${host}` } : { rpID: "localhost", origin: "http://localhost:3000" };
}

function createUserPasskeys(deps = {}) {
  const {
    webauthn = require("@simplewebauthn/server"),
    users = require("./User.model").UserModelDef,
    audit = require("../../utils/audit").audit,
    finishSignIn = (...args) => require("./User.controller").signInWithoutPassword(...args),
    site = defaultSite,
    now = () => Date.now(),
    log = logWithSource,
  } = deps;

  const cookieOptions = () => ({ httpOnly: true, sameSite: "Strict", secure: process.env.NODE_ENV === "production", path: COOKIE_PATH });

  // p: "register" (with the user's tz) or "login"; one cannot stand for the other.
  const setChallenge = (res, challenge, purpose, sub = "") => {
    const token = jwt.sign({ c: challenge, p: purpose, s: sub, iat: Math.floor(now() / 1000) }, challengeSecret(), { algorithm: "HS256", expiresIn: CHALLENGE_SEC });
    res.cookie(CHALLENGE_COOKIE, token, { ...cookieOptions(), maxAge: CHALLENGE_SEC * 1000 });
  };
  const takeChallenge = (req, res, purpose, sub = "") => {
    const token = req.cookies?.[CHALLENGE_COOKIE];
    res.clearCookie(CHALLENGE_COOKIE, cookieOptions());
    if (!token) return null;
    try {
      const p = jwt.verify(token, challengeSecret(), { algorithms: ["HS256"], clockTimestamp: Math.floor(now() / 1000) });
      return p.p === purpose && p.s === sub && typeof p.c === "string" ? p.c : null;
    } catch {
      return null;
    }
  };

  const findActive = async (filter) => rows(await users.get(filter, "active"));

  // POST /auth/passkey/register-options (signed in)
  const registerOptions = async (req, res) => {
    try {
      const user = req.actor.user || {};
      const name = req.actor.name || "Tamheed";
      const { rpID } = site();
      const options = await webauthn.generateRegistrationOptions({
        rpName: "تمهيد",
        rpID,
        userName: name,
        userDisplayName: name,
        attestationType: "none",
        excludeCredentials: (user.systemPasskeys || []).map((p) => ({ id: p.id, transports: p.transports })),
        // The fingerprint or face is required: the passkey stands for the password.
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
      });
      setChallenge(res, options.challenge, "register", String(req.actor.tz));
      return res.json({ ok: true, options });
    } catch (err) {
      log("UserPasskey.registerOptions", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  // POST /auth/passkey/register { response } (signed in)
  const register = async (req, res) => {
    const failed = () => res.status(400).json({ ok: false, message: SAVE_FAILED });
    try {
      const tz = String(req.actor.tz);
      const challenge = takeChallenge(req, res, "register", tz);
      if (!challenge || !req.body?.response) return failed();
      const { rpID, origin } = site();
      let result;
      try {
        result = await webauthn.verifyRegistrationResponse({
          response: req.body.response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID,
          requireUserVerification: true,
        });
      } catch {
        return failed();
      }
      if (!result?.verified || !result.registrationInfo?.credential) return failed();
      const { credential } = result.registrationInfo;
      const fresh = (await findActive({ tz }))[0];
      if (!fresh) return failed();
      const kept = (fresh.systemPasskeys || []).filter((p) => p.id !== credential.id);
      const entry = {
        id: credential.id,
        publicKey: toB64(credential.publicKey),
        counter: Number(credential.counter) || 0,
        transports: credential.transports || [],
        createdAt: new Date(now()),
        lastUsedAt: null,
      };
      await users.updateExisting({ tz }, { systemPasskeys: [...kept, entry].slice(-MAX_PASSKEYS) }, "active");
      await audit.record(req, { module: "users", action: "passkey_add", targetType: "user", targetId: tz, targetLabel: req.actor.name });
      return res.json({ ok: true });
    } catch (err) {
      log("UserPasskey.register", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  // POST /auth/passkey/login-options (public): any passkey of this site may answer.
  const loginOptions = async (req, res) => {
    try {
      const { rpID } = site();
      const options = await webauthn.generateAuthenticationOptions({ rpID, userVerification: "required" });
      setChallenge(res, options.challenge, "login");
      return res.json({ ok: true, options });
    } catch (err) {
      log("UserPasskey.loginOptions", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  // POST /auth/passkey/login { response } (public): ends like any sign-in.
  const login = async (req, res) => {
    const bad = () => res.status(400).json({ ok: false, message: BAD_MESSAGE });
    try {
      const challenge = takeChallenge(req, res, "login");
      const response = req.body?.response;
      const credId = typeof response?.id === "string" ? response.id : "";
      if (!challenge || !credId) return bad();
      const found = await findActive({ "systemPasskeys.id": credId });
      if (found.length !== 1) return bad();
      const user = found[0];
      const stored = (user.systemPasskeys || []).find((p) => p.id === credId);
      if (!stored) return bad();

      const isSystem = isSystemTz(String(user.tz || ""));
      if (isLocked(user, { isSystem })) return res.status(423).json({ code: "ACCOUNT_LOCKED", message: LOCKED_MESSAGE });
      // A blocked IT user with no role has no way into System.
      if (!isSystem && isItUser(user) && !resolveRole(user) && !isHiddenIt(user)) return bad();

      const { rpID, origin } = site();
      let result;
      try {
        result = await webauthn.verifyAuthenticationResponse({
          response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID,
          requireUserVerification: true,
          credential: { id: stored.id, publicKey: fromB64(stored.publicKey), counter: Number(stored.counter) || 0, transports: stored.transports },
        });
      } catch {
        return bad();
      }
      if (!result?.verified) return bad();
      const newCounter = Number(result.authenticationInfo?.newCounter) || 0;
      await users.updateExisting({ tz: user.tz }, {
        systemPasskeys: user.systemPasskeys.map((p) => (p.id === credId ? { ...p, counter: newCounter, lastUsedAt: new Date(now()) } : p)),
      }, "active");
      return await finishSignIn(req, res, user, "active", isSystem);
    } catch (err) {
      log("UserPasskey.login", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  return { registerOptions, register, loginOptions, login };
}

// The one the server uses, made on first use.
let shared = null;
const userPasskeys = () => shared || (shared = createUserPasskeys());

module.exports = { createUserPasskeys, userPasskeys, challengeSecret, CHALLENGE_COOKIE };
