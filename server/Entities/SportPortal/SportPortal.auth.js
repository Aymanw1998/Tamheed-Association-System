const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const QRCode = require("qrcode");
const { sportPeople } = require("../../utils/sportPeople");
const { SportPlayerModelDef } = require("../Sport/SportPlayer.model");
const { SportLoginCodeModelDef } = require("../Sport/SportLoginCode.model");
const { sha256 } = require("../../utils/jwt");
const { generateOtp6 } = require("../../utils/otp");
const { sendSportLoginCodeEmail } = require("../../utils/sendEmail");
const { logWithSource } = require("../../middleware/logger");

const COOKIE_NAME = "tamheed_sport";
const COOKIE_PATH = "/api/sport-portal";
const SESSION_TYP = "sport-student";
// Signed in until signing out (owner, 2026-11-01): a session lasts a year and
// is renewed for another year on a visit a day or more after it was made, so
// only a year without a visit ends it. A sports manager's sign-out
// (student.sportSignedOutAt) ends every older session.
const SESSION_MS = 365 * 24 * 60 * 60 * 1000;
const RENEW_MS = 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;
const LOCK_MS = 10 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const NO_SECRET = "SPORT_SESSION_SECRET is not set";

const GENERIC_CODE_MESSAGE = "إذا كان الرقم مسجّلًا ولديه بريد، سيصله رمز. لم يصلك؟ توجّه إلى المرشد";
// A number with no player in the sport department, or no email (owner, 2026-11-03).
const NOT_IN_SPORT_MESSAGE = "الطالب غير مسجّل في قسم الرياضة. توجّه إلى المرشد";
const NO_EMAIL_MESSAGE = "لا يوجد بريد إلكتروني مسجّل لهذا الطالب لإرسال الرمز. توجّه إلى المرشد";
const BAD_CODE_MESSAGE = "الرمز غير صحيح أو انتهت صلاحيته";
const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";
const BAD_CARD_MESSAGE = "البطاقة غير صالحة. اطلب بطاقة جديدة من المرشد";
// A card token is 32 random bytes (43 characters); anything shorter is not one.
const MIN_CARD_TOKEN = 32;

// The sport site's address for the card's link: SPORT_HOST in production,
// the sport dev server (sport/.env PORT) otherwise.
const defaultSportUrl = () => (process.env.SPORT_HOST ? `https://${process.env.SPORT_HOST}` : "http://localhost:3001");

const rows = (r) => (r?.success && Array.isArray(r.result) ? r.result : []);

// host-only (no domain): the staff refresh cookie's domain never applies here.
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "Lax",
  secure: process.env.NODE_ENV === "production",
  path: COOKIE_PATH,
});

// Dependencies are injectable so the flow can be tested without a database.
function createSportAuth(deps = {}) {
  const {
    // A player is a student or a staff user (utils/sportPeople.js, owner 2026-11-09).
    students = sportPeople,
    players = SportPlayerModelDef,
    // Loaded on first use, so requiring this file does not pull in the staff controller.
    ensureSport = () => require("../Sport/Sport.controller").ensureFootball(),
    codes = SportLoginCodeModelDef,
    sendCode = sendSportLoginCodeEmail,
    makeCode = generateOtp6,
    makeCardToken = () => crypto.randomBytes(32).toString("base64url"),
    sportUrl = defaultSportUrl,
    log = logWithSource,
    now = () => Date.now(),
  } = deps;

  // iat is set from now() (not the system clock), like every other time here.
  const startSession = (res, studentId, key) => {
    const token = jwt.sign({ sub: String(studentId), typ: SESSION_TYP, iat: Math.floor(now() / 1000) }, key, {
      algorithm: "HS256",
      expiresIn: Math.floor(SESSION_MS / 1000),
    });
    res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: SESSION_MS });
  };

  // Signed (iat, whole seconds) before the student's last sign-out by a manager.
  const signedOutSince = (iat, student) => {
    const at = new Date(student?.sportSignedOutAt ?? NaN).getTime();
    return !Number.isNaN(at) && Number(iat) < Math.floor(at / 1000);
  };

  // Fails closed: there is no fallback to any other secret.
  const secret = () => {
    const value = process.env.SPORT_SESSION_SECRET;
    if (!value) throw new Error(NO_SECRET);
    return value;
  };

  // Only a football player row counts; rows of any other (old) sport do not.
  const hasSportRow = async (studentId) => {
    const sport = await ensureSport();
    return rows(await players.get({ studentId: String(studentId), sportId: String(sport._id) })).length > 0;
  };

  // One ID number may name a student record and a user record (a staff member
  // entered as a student before users could play): only the football players
  // among them count. When none is a player, the list is left as it was.
  const playersOnly = async (found) => {
    if (found.length <= 1) return found;
    const flags = await Promise.all(found.map((p) => hasSportRow(p._id)));
    const kept = found.filter((_, i) => flags[i]);
    return kept.length ? kept : found;
  };

  const requestCode = async (req, res) => {
    const generic = () => res.json({ ok: true, message: GENERIC_CODE_MESSAGE });
    try {
      const tz = String(req.body?.tz ?? "").trim();
      // The code step comes only for a player of the sport department with an
      // email; otherwise the page says why (owner, 2026-11-03).
      const notInSport = () => res.status(404).json({ ok: false, code: "NOT_IN_SPORT", message: NOT_IN_SPORT_MESSAGE });
      if (!tz) return notInSport();
      secret(); // fails closed before any code is created or sent

      const found = await playersOnly(rows(await students.get({ tz })));
      if (found.length > 1) {
        // Ids only: the ID number never goes into the log.
        log("SportPortal.requestCode", new Error("duplicate student tz"), { ids: found.map((s) => String(s._id)) });
        return generic();
      }
      const student = found[0];
      if (!student) return notInSport();
      const studentId = String(student._id);
      if (!(await hasSportRow(studentId))) return notInSport();
      if (!String(student.email || "").trim()) return res.status(404).json({ ok: false, code: "NO_EMAIL", message: NO_EMAIL_MESSAGE });

      const existing = rows(await codes.get({ studentId }))[0];
      let attempts = 0;
      if (existing) {
        if (existing.lockedUntil && new Date(existing.lockedUntil).getTime() > now()) return generic();
        if (existing.sentAt && now() - new Date(existing.sentAt).getTime() < RESEND_MS) return generic();
        // A new code does not wipe the wrong guesses; only a lock that has run out does.
        attempts = existing.lockedUntil ? 0 : Number(existing.attempts) || 0;
      }

      const code = makeCode();
      await codes.update({ studentId }, {
        studentId,
        codeHash: sha256(code),
        expiresAt: new Date(now() + CODE_TTL_MS),
        sentAt: new Date(now()),
        attempts,
        lockedUntil: null,
      });
      // Not awaited: the response time must not tell a real ID from an unknown one.
      Promise.resolve()
        .then(() => sendCode(String(student.email).trim(), code))
        .catch((e) => log("SportPortal.requestCode", e));
      return generic();
    } catch (err) {
      log("SportPortal.requestCode", err);
      return generic();
    }
  };

  const verify = async (req, res) => {
    const bad = () => res.status(400).json({ ok: false, message: BAD_CODE_MESSAGE });
    try {
      const tz = String(req.body?.tz ?? "").trim();
      const code = String(req.body?.code ?? "").trim();
      const secretValue = secret();
      if (!tz || !/^[0-9]{6}$/.test(code)) return bad();

      const found = await playersOnly(rows(await students.get({ tz })));
      if (found.length !== 1) return bad();
      const studentId = String(found[0]._id);

      let stored = rows(await codes.get({ studentId }))[0];
      if (!stored) return bad();
      if (stored.lockedUntil) {
        // Locked: refused exactly like a wrong code, even for the right one.
        if (new Date(stored.lockedUntil).getTime() > now()) return bad();
        await codes.updateExisting({ studentId }, { attempts: 0, lockedUntil: null });
        stored = { ...stored, attempts: 0, lockedUntil: null };
      }
      if (!stored.codeHash || new Date(stored.expiresAt).getTime() <= now()) return bad();

      if (sha256(code) !== stored.codeHash) {
        // Atomic $inc: concurrent guesses each count.
        const after = await codes.increment({ studentId }, "attempts", 1);
        if (Number(after?.result?.attempts) >= MAX_ATTEMPTS) {
          await codes.updateExisting({ studentId }, { lockedUntil: new Date(now() + LOCK_MS) });
        }
        return bad();
      }

      if (!(await hasSportRow(studentId))) return bad();

      // A used code is cleared, so it cannot be replayed.
      await codes.delete({ studentId });
      startSession(res, studentId, secretValue);
      return res.json({ ok: true });
    } catch (err) {
      log("SportPortal.verify", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  const logout = (req, res) => {
    res.clearCookie(COOKIE_NAME, cookieOptions());
    return res.json({ ok: true });
  };

  // Reads only the sport cookie: never Authorization, never the staff refresh cookie.
  const requireSportStudent = async (req, res, next) => {
    const refuse = () => res.status(401).json({ ok: false, code: "SPORT_AUTH" });
    try {
      const token = req.cookies?.[COOKIE_NAME];
      if (!token) return refuse();
      const key = secret();
      let payload;
      try {
        payload = jwt.verify(token, key, { algorithms: ["HS256"] });
      } catch {
        return refuse();
      }
      if (payload?.typ !== SESSION_TYP || !payload.sub) return refuse();

      // The student and the player row are read together (one round trip).
      const [found, isPlayer] = await Promise.all([students.get({ _id: String(payload.sub) }), hasSportRow(payload.sub)]);
      const student = rows(found)[0];
      if (!student || !isPlayer || signedOutSince(payload.iat, student)) return refuse();
      if (now() - Number(payload.iat) * 1000 >= RENEW_MS) startSession(res, student._id, key);
      req.sportStudent = student;
      return next();
    } catch (err) {
      log("SportPortal.requireSportStudent", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  // POST /api/sports/players/:studentId/sign-out (sports.manage): ends the
  // player's sessions on every phone.
  const signOutPlayer = async (req, res) => {
    try {
      const studentId = String(req.params?.studentId ?? "").trim();
      const student = studentId ? rows(await students.get({ _id: studentId }))[0] : null;
      if (!student) return res.status(404).json({ ok: false, message: "غير موجود" });
      // Its passkeys go too: a lost phone cannot sign in with a fingerprint.
      await students.updateExisting({ _id: studentId }, { sportSignedOutAt: new Date(now()), sportPasskeys: [] });
      return res.json({ ok: true });
    } catch (err) {
      log("SportPortal.signOutPlayer", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  // POST /api/sports/players/:studentId/login-card (sports.manage): a new
  // sign-in card for a player, for players without email (owner,
  // 2026-11-01). The token goes in the link's #fragment, so it never reaches
  // a server log; only its hash is stored, and the new card cancels the old.
  const issueCard = async (req, res) => {
    try {
      const studentId = String(req.params?.studentId ?? "").trim();
      const student = studentId ? rows(await students.get({ _id: studentId }))[0] : null;
      if (!student || !(await hasSportRow(studentId))) return res.status(404).json({ ok: false, message: "اللاعب غير موجود" });
      const token = makeCardToken();
      await students.updateExisting({ _id: studentId }, {
        sportCardHash: sha256(token),
        sportCardIssuedAt: new Date(now()),
        sportCardIssuedBy: String(req.actor?.tz || ""),
      });
      const url = `${sportUrl()}/#card=${token}`;
      const svg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
      // The same QR as a picture, for the card the browser makes to share or save.
      const png = await QRCode.toDataURL(url, { margin: 1, width: 700, errorCorrectionLevel: "M" });
      return res.json({ ok: true, url, svg, png });
    } catch (err) {
      log("SportPortal.issueCard", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  // POST /api/sport-portal/card { token }: the scanned card signs this phone in.
  const signInWithCard = async (req, res) => {
    const bad = () => res.status(400).json({ ok: false, message: BAD_CARD_MESSAGE });
    try {
      const token = String(req.body?.token ?? "").trim();
      const secretValue = secret();
      if (token.length < MIN_CARD_TOKEN) return bad();
      const found = rows(await students.get({ sportCardHash: sha256(token) }));
      if (found.length !== 1) return bad();
      const studentId = String(found[0]._id);
      if (!(await hasSportRow(studentId))) return bad();
      startSession(res, studentId, secretValue);
      return res.json({ ok: true });
    } catch (err) {
      log("SportPortal.signInWithCard", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  // For the passkey sign-in (SportPortal.passkey.js).
  const signIn = (res, studentId) => startSession(res, studentId, secret());
  const isPlayer = (studentId) => hasSportRow(studentId);

  return { requestCode, verify, logout, requireSportStudent, signOutPlayer, issueCard, signInWithCard, signIn, isPlayer };
}

module.exports = {
  ...createSportAuth(),
  createSportAuth,
  COOKIE_NAME,
  GENERIC_CODE_MESSAGE,
  NOT_IN_SPORT_MESSAGE,
  NO_EMAIL_MESSAGE,
  BAD_CODE_MESSAGE,
  BAD_CARD_MESSAGE,
};
