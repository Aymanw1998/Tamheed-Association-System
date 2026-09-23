const crypto = require("crypto");
const { InviteTokenModelDef } = require("./InviteToken.model");
const { RegistrationAttemptModelDef } = require("./RegistrationAttempt.model");
const { StudentModelDef } = require("../Student/Student.model");
const { handleUpload } = require("../UploadFile/file");
const { logWithSource } = require("../../middleware/logger");
const { isValidIsraeliId } = require("../../utils/israeliId");

// One fixed parent-registration link. Its secret changes only when an admin
// rotates it. Parents' requests join the waiting list (status "ينتظر") and
// never become students without staff approval.
const LINK_KEY = "parent-registration";
const WEEKLY_LIMIT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const ATTEMPTS_KEPT = 100;
const PARENT_SOURCE = "اهل";
const PENDING_STATUS = "ينتظر";
const RECEIVED_MESSAGE = "تم استلام الطلب، سنتواصل معكم قريبًا";

/* ================= helpers ================= */

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);

  if (typeof value === "string") {
    const s = value.trim();

    let m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m.map(Number);
      return new Date(Date.UTC(yyyy, mm - 1, dd));
    }

    m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const [, yyyy, mm, dd] = m.map(Number);
      return new Date(Date.UTC(yyyy, mm - 1, dd));
    }

    const ts = Date.parse(s);
    if (!Number.isNaN(ts)) return new Date(ts);
  }

  return null;
}

const resultsOf = (res) => (res?.success && Array.isArray(res.result) ? res.result : []);
const newestFirst = (a, b) => new Date(b.createdAt) - new Date(a.createdAt);

async function getLinkToken() {
  const [link] = resultsOf(await InviteTokenModelDef.get({ key: LINK_KEY }));
  return link?.token || null;
}

async function saveNewToken() {
  const token = crypto.randomBytes(18).toString("base64url");
  await InviteTokenModelDef.update({ key: LINK_KEY }, { key: LINK_KEY, token });
  return token;
}

async function isCurrentToken(candidate) {
  const expected = await getLinkToken();
  if (!candidate || !expected) return false;
  const a = Buffer.from(String(candidate));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Parent requests created in the last 7 days, whatever their status now.
// Rejected (deleted) requests no longer count, so removing spam frees room.
async function countRecentParentRequests() {
  const since = Date.now() - 7 * DAY_MS;
  return resultsOf(await StudentModelDef.get({ source: PARENT_SOURCE }))
    .filter((student) => new Date(student.createdAt).getTime() >= since).length;
}

async function listAttempts() {
  return resultsOf(await RegistrationAttemptModelDef.get({})).sort(newestFirst);
}

const toPublicAttempt = (attempt) => ({
  tz: attempt.tz,
  firstname: attempt.firstname,
  lastname: attempt.lastname,
  phone: attempt.phone,
  father_phone: attempt.father_phone,
  mother_phone: attempt.mother_phone,
  reason: attempt.reason,
  createdAt: attempt.createdAt,
});

/* ================= admin: the link ================= */

const getLink = async (req, res) => {
  try {
    const token = (await getLinkToken()) || (await saveNewToken());
    const since = Date.now() - 30 * DAY_MS;
    const attempts = (await listAttempts())
      .filter((attempt) => new Date(attempt.createdAt).getTime() >= since)
      .map(toPublicAttempt);

    return res.status(200).json({
      ok: true,
      token,
      usedThisWeek: await countRecentParentRequests(),
      weeklyLimit: WEEKLY_LIMIT,
      attempts,
    });
  } catch (err) {
    logWithSource("InviteToken.getLink", err);
    return res.status(500).json({ ok: false, message: "تعذّر تحميل رابط التسجيل" });
  }
};

const rotateLink = async (req, res) => {
  try {
    return res.status(200).json({ ok: true, token: await saveNewToken() });
  } catch (err) {
    logWithSource("InviteToken.rotateLink", err);
    return res.status(500).json({ ok: false, message: "تعذّر تغيير الرابط" });
  }
};

/* ================= public: the parents' form ================= */

const validateToken = async (req, res) => {
  try {
    if (!(await isCurrentToken(req.params.token))) {
      return res.status(404).json({ valid: false });
    }
    return res.status(200).json({
      valid: true,
      open: (await countRecentParentRequests()) < WEEKLY_LIMIT,
    });
  } catch (err) {
    logWithSource("InviteToken.validateToken", err);
    return res.status(500).json({ valid: false, message: "خطأ في فحص الرابط" });
  }
};

const SHORT_FIELDS = [
  "firstname", "lastname", "gender", "phone", "email", "city", "street",
  "father_name", "mother_name", "father_phone", "mother_phone",
  "father_work", "mother_work", "school", "layer",
];
const LONG_FIELDS = ["health_status", "notes"];

const cleanText = (value, max) => String(value ?? "").trim().slice(0, max);

// Only these fields are read from the public form; status, source,
// main_teacher and photo are always set by the server.
function readRegistration(body = {}) {
  const fields = { tz: String(body.tz ?? "").trim() };
  for (const name of SHORT_FIELDS) fields[name] = cleanText(body[name], 100);
  for (const name of LONG_FIELDS) fields[name] = cleanText(body[name], 1000);
  fields.birth_date = toDate(cleanText(body.birth_date, 40));
  return fields;
}

function registrationError(fields) {
  if (!isValidIsraeliId(fields.tz)) return "رقم الهوية غير صحيح";
  if (!fields.firstname || !fields.lastname) return "اسم الطالب واسم العائلة مطلوبان";
  return "";
}

async function recordAttempt(fields, reason) {
  await RegistrationAttemptModelDef.create({
    tz: fields.tz,
    firstname: fields.firstname,
    lastname: fields.lastname,
    phone: fields.phone,
    father_phone: fields.father_phone,
    mother_phone: fields.mother_phone,
    reason,
    createdAt: new Date(),
  });
  // Keep only the newest attempts so a flood cannot grow the collection.
  for (const old of (await listAttempts()).slice(ATTEMPTS_KEPT)) {
    await RegistrationAttemptModelDef.delete({ _id: old._id });
  }
}

async function savePhoto(tz, file) {
  try {
    const uploaded = await handleUpload(
      file,
      StudentModelDef.dbName,
      StudentModelDef.collections.active,
      tz
    );
    if (uploaded?.secure_url) {
      await StudentModelDef.update({ tz }, { photo: uploaded.secure_url });
    }
  } catch (err) {
    logWithSource("InviteToken.savePhoto", err);
  }
}

const submitRegistration = async (req, res) => {
  try {
    if (!(await isCurrentToken(req.params.token))) {
      return res.status(404).json({
        ok: false,
        valid: false,
        message: "الرابط غير صالح، اطلبوا الرابط من الجمعية",
      });
    }

    if ((await countRecentParentRequests()) >= WEEKLY_LIMIT) {
      return res.status(429).json({
        ok: false,
        code: "INTAKE_CLOSED",
        message: "استقبال الطلبات متوقف مؤقتًا، حاولوا بعد أيام",
      });
    }

    const fields = readRegistration(req.body);
    const error = registrationError(fields);
    if (error) {
      return res.status(400).json({ ok: false, message: error });
    }

    // A known ID gets exactly the same reply as a new one, so the public form
    // cannot reveal who is registered; staff see the refusal next to the link.
    const [existing] = resultsOf(await StudentModelDef.get({ tz: fields.tz }));
    if (existing) {
      await recordAttempt(fields, existing.status === PENDING_STATUS ? "pending" : "exists");
      return res.status(200).json({ ok: true, message: RECEIVED_MESSAGE });
    }

    const now = new Date();
    await StudentModelDef.create({
      ...fields,
      photo: "",
      main_teacher: null,
      source: PARENT_SOURCE,
      status: PENDING_STATUS,
      createdAt: now,
      updatedAt: now,
    });
    res.status(200).json({ ok: true, message: RECEIVED_MESSAGE });

    // Uploaded after replying: the reply must not wait on (or mention) Drive,
    // or its timing would tell a new ID from a known one.
    if (req.file) {
      await savePhoto(fields.tz, req.file);
    }
  } catch (err) {
    logWithSource("InviteToken.submitRegistration", err);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, message: "تعذّر إرسال الطلب، حاولوا لاحقًا" });
    }
  }
};

module.exports = {
  getLink,
  rotateLink,
  validateToken,
  submitRegistration,
};
