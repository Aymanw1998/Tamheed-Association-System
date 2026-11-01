const jwt = require("jsonwebtoken");
const { logWithSource } = require("../../middleware/logger");

// Passkeys on the sport site (owner, 2026-11-01): a signed-in player saves a
// passkey on the phone, then signs in with a fingerprint or face, no email or
// card needed. Discoverable credentials, so no ID number is typed. Saved on
// the student (sportPasskeys: { id, publicKey, counter, transports,
// createdAt, lastUsedAt }), never sent to any page. The challenge travels in
// a signed, 5-minute, single-use cookie: no table of challenges.

const CHALLENGE_COOKIE = "tamheed_sport_pk";
const COOKIE_PATH = "/api/sport-portal";
const CHALLENGE_SEC = 5 * 60;
const MAX_PASSKEYS = 10;
const BAD_MESSAGE = "تعذّر الدخول بالبصمة. ادخل بالرمز أو بالبطاقة";
const SAVE_FAILED = "تعذّر حفظ الدخول بالبصمة على هذا الهاتف";
const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";

const rows = (r) => (r?.success && Array.isArray(r.result) ? r.result : []);
const toB64 = (bytes) => Buffer.from(bytes).toString("base64url");
const fromB64 = (text) => new Uint8Array(Buffer.from(String(text), "base64url"));

// The sport site: its host name is the passkey's "relying party".
function defaultSite() {
  const host = process.env.SPORT_HOST;
  return host ? { rpID: host, origin: `https://${host}` } : { rpID: "localhost", origin: "http://localhost:3001" };
}

function createSportPasskeys(deps = {}) {
  const {
    webauthn = require("@simplewebauthn/server"),
    students = require("../Student/Student.model").StudentModelDef,
    isPlayer = (id) => require("./SportPortal.auth").isPlayer(id),
    signIn = (res, id) => require("./SportPortal.auth").signIn(res, id),
    site = defaultSite,
    now = () => Date.now(),
    log = logWithSource,
  } = deps;

  const secret = () => {
    const value = process.env.SPORT_SESSION_SECRET;
    if (!value) throw new Error("SPORT_SESSION_SECRET is not set");
    return value;
  };
  const cookieOptions = () => ({ httpOnly: true, sameSite: "Lax", secure: process.env.NODE_ENV === "production", path: COOKIE_PATH });

  // p: "register" (with the student id) or "login"; one cannot stand for the other.
  const setChallenge = (res, challenge, purpose, sub = "") => {
    const token = jwt.sign({ c: challenge, p: purpose, s: sub, iat: Math.floor(now() / 1000) }, secret(), { algorithm: "HS256", expiresIn: CHALLENGE_SEC });
    res.cookie(CHALLENGE_COOKIE, token, { ...cookieOptions(), maxAge: CHALLENGE_SEC * 1000 });
  };
  const takeChallenge = (req, res, purpose, sub = "") => {
    const token = req.cookies?.[CHALLENGE_COOKIE];
    res.clearCookie(CHALLENGE_COOKIE, cookieOptions());
    if (!token) return null;
    try {
      const p = jwt.verify(token, secret(), { algorithms: ["HS256"], clockTimestamp: Math.floor(now() / 1000) });
      return p.p === purpose && p.s === sub && typeof p.c === "string" ? p.c : null;
    } catch {
      return null;
    }
  };

  const nameOf = (s) => `${s.firstname || ""} ${s.lastname || ""}`.trim() || "لاعب";

  // POST /passkey/register-options (signed-in player)
  const registerOptions = async (req, res) => {
    try {
      const student = req.sportStudent;
      const { rpID } = site();
      const options = await webauthn.generateRegistrationOptions({
        rpName: "تمهيد - رياضة",
        rpID,
        userName: nameOf(student),
        userDisplayName: nameOf(student),
        attestationType: "none",
        excludeCredentials: (student.sportPasskeys || []).map((p) => ({ id: p.id, transports: p.transports })),
        authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
      });
      setChallenge(res, options.challenge, "register", String(student._id));
      return res.json({ ok: true, options });
    } catch (err) {
      log("SportPasskey.registerOptions", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  // POST /passkey/register { response } (signed-in player)
  const register = async (req, res) => {
    const failed = () => res.status(400).json({ ok: false, message: SAVE_FAILED });
    try {
      const student = req.sportStudent;
      const studentId = String(student._id);
      const challenge = takeChallenge(req, res, "register", studentId);
      if (!challenge || !req.body?.response) return failed();
      const { rpID, origin } = site();
      let result;
      try {
        result = await webauthn.verifyRegistrationResponse({
          response: req.body.response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID,
        });
      } catch {
        return failed();
      }
      if (!result?.verified || !result.registrationInfo?.credential) return failed();
      const { credential } = result.registrationInfo;
      const fresh = rows(await students.get({ _id: studentId }))[0] || student;
      const kept = (fresh.sportPasskeys || []).filter((p) => p.id !== credential.id);
      const entry = {
        id: credential.id,
        publicKey: toB64(credential.publicKey),
        counter: Number(credential.counter) || 0,
        transports: credential.transports || [],
        createdAt: new Date(now()),
        lastUsedAt: null,
      };
      await students.updateExisting({ _id: studentId }, { sportPasskeys: [...kept, entry].slice(-MAX_PASSKEYS) });
      return res.json({ ok: true });
    } catch (err) {
      log("SportPasskey.register", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  // POST /passkey/login-options (public): any passkey of this site may answer.
  const loginOptions = async (req, res) => {
    try {
      const { rpID } = site();
      const options = await webauthn.generateAuthenticationOptions({ rpID, userVerification: "preferred" });
      setChallenge(res, options.challenge, "login");
      return res.json({ ok: true, options });
    } catch (err) {
      log("SportPasskey.loginOptions", err);
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
      const found = rows(await students.get({ "sportPasskeys.id": credId }));
      if (found.length !== 1) return bad();
      const student = found[0];
      const studentId = String(student._id);
      const saved = (student.sportPasskeys || []).find((p) => p.id === credId);
      if (!saved || !(await isPlayer(studentId))) return bad();
      const { rpID, origin } = site();
      let result;
      try {
        result = await webauthn.verifyAuthenticationResponse({
          response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID,
          credential: { id: saved.id, publicKey: fromB64(saved.publicKey), counter: Number(saved.counter) || 0, transports: saved.transports },
        });
      } catch {
        return bad();
      }
      if (!result?.verified) return bad();
      const newCounter = Number(result.authenticationInfo?.newCounter) || 0;
      await students.updateExisting({ _id: studentId }, {
        sportPasskeys: student.sportPasskeys.map((p) => (p.id === credId ? { ...p, counter: newCounter, lastUsedAt: new Date(now()) } : p)),
      });
      signIn(res, studentId);
      return res.json({ ok: true });
    } catch (err) {
      log("SportPasskey.login", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  return { registerOptions, register, loginOptions, login };
}

module.exports = { ...createSportPasskeys(), createSportPasskeys, CHALLENGE_COOKIE };
