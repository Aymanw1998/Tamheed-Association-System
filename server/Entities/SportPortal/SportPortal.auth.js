const jwt = require("jsonwebtoken");
const { StudentModelDef } = require("../Student/Student.model");
const { SportPlayerModelDef } = require("../Sport/SportPlayer.model");
const { SportLoginCodeModelDef } = require("../Sport/SportLoginCode.model");
const { sha256 } = require("../../utils/jwt");
const { generateOtp6 } = require("../../utils/otp");
const { sendSportLoginCodeEmail } = require("../../utils/sendEmail");
const { logWithSource } = require("../../middleware/logger");

const COOKIE_NAME = "tamheed_sport";
const COOKIE_PATH = "/api/sport-portal";
const SESSION_TYP = "sport-student";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;
const LOCK_MS = 10 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const NO_SECRET = "SPORT_SESSION_SECRET is not set";

const GENERIC_CODE_MESSAGE = "إذا كان الرقم مسجّلًا ولديه بريد، سيصله رمز. لم يصلك؟ توجّه إلى المرشد";
const BAD_CODE_MESSAGE = "الرمز غير صحيح أو انتهت صلاحيته";
const LOCKED_MESSAGE = "محاولات كثيرة. حاول بعد 10 دقائق";
const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";

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
    students = StudentModelDef,
    players = SportPlayerModelDef,
    codes = SportLoginCodeModelDef,
    sendCode = sendSportLoginCodeEmail,
    makeCode = generateOtp6,
    log = logWithSource,
    now = () => Date.now(),
  } = deps;

  // Fails closed: there is no fallback to any other secret.
  const secret = () => {
    const value = process.env.SPORT_SESSION_SECRET;
    if (!value) throw new Error(NO_SECRET);
    return value;
  };

  const hasSportRow = async (studentId) => rows(await players.get({ studentId: String(studentId) })).length > 0;

  const requestCode = async (req, res) => {
    const generic = () => res.json({ ok: true, message: GENERIC_CODE_MESSAGE });
    try {
      const tz = String(req.body?.tz ?? "").trim();
      if (!tz) return generic();

      const found = rows(await students.get({ tz }));
      if (found.length > 1) {
        // Ids only: the ID number never goes into the log.
        log("SportPortal.requestCode", new Error("duplicate student tz"), { ids: found.map((s) => String(s._id)) });
        return generic();
      }
      const student = found[0];
      if (!student || !String(student.email || "").trim()) return generic();
      const studentId = String(student._id);
      if (!(await hasSportRow(studentId))) return generic();

      const existing = rows(await codes.get({ studentId }))[0];
      if (existing) {
        if (existing.lockedUntil && new Date(existing.lockedUntil).getTime() > now()) return generic();
        if (existing.sentAt && now() - new Date(existing.sentAt).getTime() < RESEND_MS) return generic();
      }

      const code = makeCode();
      await codes.update({ studentId }, {
        studentId,
        codeHash: sha256(code),
        expiresAt: new Date(now() + CODE_TTL_MS),
        sentAt: new Date(now()),
        attempts: 0,
        lockedUntil: null,
      });
      await sendCode(String(student.email).trim(), code);
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
      if (!tz || !code) return bad();

      const found = rows(await students.get({ tz }));
      if (found.length !== 1) return bad();
      const studentId = String(found[0]._id);

      const stored = rows(await codes.get({ studentId }))[0];
      if (!stored) return bad();
      if (stored.lockedUntil && new Date(stored.lockedUntil).getTime() > now()) {
        return res.status(429).json({ ok: false, message: LOCKED_MESSAGE });
      }
      if (!stored.codeHash || new Date(stored.expiresAt).getTime() <= now()) return bad();

      if (sha256(code) !== stored.codeHash) {
        const attempts = (Number(stored.attempts) || 0) + 1;
        const locked = attempts >= MAX_ATTEMPTS;
        await codes.updateExisting({ studentId }, {
          attempts: locked ? 0 : attempts,
          lockedUntil: locked ? new Date(now() + LOCK_MS) : null,
        });
        if (locked) return res.status(429).json({ ok: false, message: LOCKED_MESSAGE });
        return bad();
      }

      if (!(await hasSportRow(studentId))) return bad();

      // A used code is cleared, so it cannot be replayed.
      await codes.delete({ studentId });
      const token = jwt.sign({ sub: studentId, typ: SESSION_TYP }, secretValue, {
        algorithm: "HS256",
        expiresIn: Math.floor(SESSION_MS / 1000),
      });
      res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: SESSION_MS });
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

      const student = rows(await students.get({ _id: String(payload.sub) }))[0];
      if (!student || !(await hasSportRow(student._id))) return refuse();
      req.sportStudent = student;
      return next();
    } catch (err) {
      log("SportPortal.requireSportStudent", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  return { requestCode, verify, logout, requireSportStudent };
}

module.exports = {
  ...createSportAuth(),
  createSportAuth,
  COOKIE_NAME,
  GENERIC_CODE_MESSAGE,
  BAD_CODE_MESSAGE,
  LOCKED_MESSAGE,
};
