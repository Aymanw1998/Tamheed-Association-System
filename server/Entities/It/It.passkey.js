const jwt = require("jsonwebtoken");
const { logWithSource } = require("../../middleware/logger");
const { itSecret } = require("../../middleware/requireIt");

// Passkeys on the IT site (owner, 2026-11-03): an IT user signed in with the
// password and the email code saves a passkey; from then on a fingerprint or
// face replaces both. Discoverable credentials, so no ID number is typed.
// Saved on the user (itPasskeys: { id, publicKey, counter, transports,
// createdAt, lastUsedAt }), never sent to any page; blocking or removing the
// IT user clears them (ItMembers.controller.js). The relying party is IT_HOST,
// so a passkey of this site works nowhere else. The challenge travels in a
// signed, 5-minute, single-use cookie, as on the sport site.

const CHALLENGE_COOKIE = "tamheed_it_pk";
const COOKIE_PATH = "/api/it";
const CHALLENGE_SEC = 5 * 60;
const MAX_PASSKEYS = 10;
const BAD_MESSAGE = "تعذّر الدخول بالبصمة. ادخل بكلمة المرور والرمز";
const SAVE_FAILED = "تعذّر حفظ الدخول بالبصمة على هذا الجهاز";
const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";

const rows = (r) => (r?.success && Array.isArray(r.result) ? r.result : []);
const toB64 = (bytes) => Buffer.from(bytes).toString("base64url");
const fromB64 = (text) => new Uint8Array(Buffer.from(String(text), "base64url"));

function defaultSite() {
  const host = process.env.IT_HOST;
  return host ? { rpID: host, origin: `https://${host}` } : { rpID: "it.localhost", origin: "http://it.localhost:3002" };
}

function createItPasskeys(deps = {}) {
  const {
    webauthn = require("@simplewebauthn/server"),
    users = require("../User/User.model").UserModelDef,
    completeSignIn = (req, res, tz, opts) => require("./It.auth").completeSignIn(req, res, tz, opts),
    site = defaultSite,
    now = () => Date.now(),
    log = logWithSource,
  } = deps;

  const cookieOptions = () => ({ httpOnly: true, sameSite: "Strict", secure: process.env.NODE_ENV === "production", path: COOKIE_PATH });

  // p: "register" (with the user's tz) or "login"; one cannot stand for the other.
  const setChallenge = (res, challenge, purpose, sub = "") => {
    const token = jwt.sign({ c: challenge, p: purpose, s: sub, iat: Math.floor(now() / 1000) }, itSecret(), { algorithm: "HS256", expiresIn: CHALLENGE_SEC });
    res.cookie(CHALLENGE_COOKIE, token, { ...cookieOptions(), maxAge: CHALLENGE_SEC * 1000 });
  };
  const takeChallenge = (req, res, purpose, sub = "") => {
    const token = req.cookies?.[CHALLENGE_COOKIE];
    res.clearCookie(CHALLENGE_COOKIE, cookieOptions());
    if (!token) return null;
    try {
      const p = jwt.verify(token, itSecret(), { algorithms: ["HS256"], clockTimestamp: Math.floor(now() / 1000) });
      return p.p === purpose && p.s === sub && typeof p.c === "string" ? p.c : null;
    } catch {
      return null;
    }
  };

  const findActive = async (filter) => rows(await users.get(filter, "active"));

  // POST /passkey/register-options (signed in on the IT site)
  const registerOptions = async (req, res) => {
    try {
      const user = req.actor.user || {};
      const name = req.actor.name || "IT";
      const { rpID } = site();
      const options = await webauthn.generateRegistrationOptions({
        rpName: "تمهيد - قسم IT",
        rpID,
        userName: name,
        userDisplayName: name,
        attestationType: "none",
        excludeCredentials: (user.itPasskeys || []).map((p) => ({ id: p.id, transports: p.transports })),
        // The fingerprint or face is required: the passkey stands for both steps.
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
      });
      setChallenge(res, options.challenge, "register", String(req.actor.tz));
      return res.json({ ok: true, options });
    } catch (err) {
      log("ItPasskey.registerOptions", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  // POST /passkey/register { response } (signed in on the IT site)
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
      const kept = (fresh.itPasskeys || []).filter((p) => p.id !== credential.id);
      const entry = {
        id: credential.id,
        publicKey: toB64(credential.publicKey),
        counter: Number(credential.counter) || 0,
        transports: credential.transports || [],
        createdAt: new Date(now()),
        lastUsedAt: null,
      };
      await users.updateExisting({ tz }, { itPasskeys: [...kept, entry].slice(-MAX_PASSKEYS) }, "active");
      return res.json({ ok: true });
    } catch (err) {
      log("ItPasskey.register", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  // POST /passkey/login-options (public): any passkey of this site may answer.
  const loginOptions = async (req, res) => {
    try {
      const { rpID } = site();
      const options = await webauthn.generateAuthenticationOptions({ rpID, userVerification: "required" });
      setChallenge(res, options.challenge, "login");
      return res.json({ ok: true, options });
    } catch (err) {
      log("ItPasskey.loginOptions", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  // POST /passkey/login { response } (public)
  const login = async (req, res) => {
    const bad = () => res.status(400).json({ ok: false, message: BAD_MESSAGE });
    try {
      const challenge = takeChallenge(req, res, "login");
      const response = req.body?.response;
      const credId = typeof response?.id === "string" ? response.id : "";
      if (!challenge || !credId) return bad();
      const found = await findActive({ "itPasskeys.id": credId });
      if (found.length !== 1) return bad();
      const user = found[0];
      const saved = (user.itPasskeys || []).find((p) => p.id === credId);
      if (!saved) return bad();
      const { rpID, origin } = site();
      let result;
      try {
        result = await webauthn.verifyAuthenticationResponse({
          response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID,
          requireUserVerification: true,
          credential: { id: saved.id, publicKey: fromB64(saved.publicKey), counter: Number(saved.counter) || 0, transports: saved.transports },
        });
      } catch {
        return bad();
      }
      if (!result?.verified) return bad();
      const newCounter = Number(result.authenticationInfo?.newCounter) || 0;
      await users.updateExisting({ tz: user.tz }, {
        itPasskeys: user.itPasskeys.map((p) => (p.id === credId ? { ...p, counter: newCounter, lastUsedAt: new Date(now()) } : p)),
      }, "active");
      // The same last step as the email code: still IT, not blocked, not locked.
      if (!(await completeSignIn(req, res, user.tz, { needsFreshPassword: true }))) return bad();
      return res.json({ ok: true });
    } catch (err) {
      log("ItPasskey.login", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  return { registerOptions, register, loginOptions, login };
}

// The one the server uses, made on first use (so requiring this file does
// not pull in the database layer).
let shared = null;
const itPasskeys = () => shared || (shared = createItPasskeys());

module.exports = { createItPasskeys, itPasskeys, CHALLENGE_COOKIE };
