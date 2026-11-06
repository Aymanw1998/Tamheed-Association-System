const crypto = require("crypto");
const { DEFAULT_RULES } = require("./defaultRules");
const { InviteTokenModelDef } = require("./InviteToken.model");
const { RulesModelDef, ConsentModelDef, ConsentHistoryModelDef } = require("./Rules.model");
const { canonicalGrade } = require("../../utils/grades");
const { StudentModelDef } = require("../Student/Student.model");
const { handleUpload } = require("../UploadFile/file");
const { passportPhotoJob } = require("../../services/passportPhotoJob");
const { logWithSource } = require("../../middleware/logger");
const { isValidIsraeliId } = require("../../utils/israeliId");
const { notifyChange } = require("../../services/liveHub");
const { isDuplicateKey } = require("../../utils/tzUnique");

// One fixed parent-registration link. Its secret changes only when an admin
// rotates it. Parents' requests join the waiting list (status "ينتظر") and
// never become students without staff approval.
const LINK_KEY = "parent-registration";
const MONTHLY_LIMIT = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
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

// Parent requests created in the last 30 days, from any address, whatever their status now.
// Rejected (deleted) requests no longer count, so removing spam frees room.
async function countRecentParentRequests() {
  const since = Date.now() - 30 * DAY_MS;
  return resultsOf(await StudentModelDef.get({ source: PARENT_SOURCE }))
    .filter((student) => new Date(student.createdAt).getTime() >= since).length;
}

/* ================= the rules and the parent's signature ================= */

const SIGNATURE = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/;
const MAX_SIGNATURE = 300 * 1024;
const PNG_START = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MIN_PNG_BYTES = 67;
const isPng = (dataAddress) => {
  const bytes = Buffer.from(dataAddress.slice(dataAddress.indexOf(",") + 1), "base64");
  return bytes.length >= MIN_PNG_BYTES && bytes.subarray(0, PNG_START.length).equals(PNG_START);
};
const MAX_RULES = 20000;

async function currentRules() {
  const rows = resultsOf(await RulesModelDef.get({}));
  return rows.reduce((latest, row) => (!latest || row.version > latest.version ? row : latest), { version: 0, text: DEFAULT_RULES });
}

// What the form sent about the rules; "" when all is in order.
function consentProblem(body, rules) {
  if (String(body.rulesVersion ?? "") !== String(rules.version)) return { status: 409, code: "RULES_CHANGED", message: "تم تحديث نظام الجمعية. يُرجى قراءته والتوقيع عليه من جديد." };
  const signature = String(body.signature ?? "");
  if (body.rulesAccepted !== "true" || !cleanText(body.signerName, 100) || !signature || signature.length > MAX_SIGNATURE || !SIGNATURE.test(signature) || !isPng(signature)) {
    return { status: 400, code: "CONSENT_REQUIRED", message: "يجب الموافقة على قوانين الجمعية وكتابة اسم ولي الأمر وإضافة توقيع/ختم صالح قبل الإرسال." };
  }
  return null;
}

const getRules = async (req, res) => {
  try {
    const rules = await currentRules();
    return res.status(200).json({ ok: true, rules: rules ? { version: rules.version, text: rules.text } : null });
  } catch (err) {
    logWithSource("InviteToken.getRules", err);
    return res.status(500).json({ ok: false, message: "تعذّر تحميل نظام الجمعية" });
  }
};

const publishRules = async (req, res) => {
  try {
    const text = String(req.body?.text ?? "").trim();
    if (text.length > MAX_RULES) return res.status(400).json({ ok: false, message: "النص طويل جدًا" });
    const latest = await currentRules();
    const version = (latest?.version || 0) + 1;
    const createdByName = String(req.actor?.name || "");
    await RulesModelDef.create({ version, text, createdAt: new Date(), createdByName });
    return res.status(200).json({ ok: true, rules: { version, text } });
  } catch (err) {
    if (isDuplicateKey(err)) return res.status(409).json({ ok: false, message: "نشر شخص آخر النظام الآن. حدّث الصفحة وحاول مرة أخرى." });
    logWithSource("InviteToken.publishRules", err);
    return res.status(500).json({ ok: false, message: "تعذّر نشر نظام الجمعية" });
  }
};

const getConsent = async (req, res) => {
  try {
    const [consent] = resultsOf(await ConsentModelDef.get({ studentId: String(req.params.studentId) }));
    if (!consent) return res.status(200).json({ ok: true, consent: null });
    if (!resultsOf(await StudentModelDef.get({ _id: String(req.params.studentId) })).length) return res.status(200).json({ ok: true, consent: null });
    const rows = resultsOf(await RulesModelDef.get({ version: consent.rulesVersion }));
    return res.status(200).json({
      ok: true,
      consent: {
        revision: consentRevision(consent),
        signerName: consent.signerName,
        signature: consent.signature,
        signedAt: consent.signedAt,
        acceptedAt: consent.acceptedAt || consent.signedAt,
        signaturePending: !consent.signature,
        rulesVersion: consent.rulesVersion,
        rulesText: rows[0]?.text ?? (consent.rulesVersion === 0 ? DEFAULT_RULES : ""),
      },
    });
  } catch (err) {
    logWithSource("InviteToken.getConsent", err);
    return res.status(500).json({ ok: false, message: "تعذّر تحميل التوقيع" });
  }
};

const digest = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const consentRevision = (consent) => consent ? digest(JSON.stringify([String(consent._id), consent.revision || "", consent.signature || "", consent.signedAt, consent.rulesVersion])) : "none";
const changedConsent = () => ({ status: 409, ok: false, code: "CONSENT_CHANGED", message: "تم تحديث التوقيع. حدّث الصفحة واطلب رابطًا جديدًا عند الحاجة." });

async function saveConsentEvidence(student, existing, body, rules, { recordedBy = "", requestId = "" } = {}) {
  const studentId = String(student._id);
  // A retry after a partial first signature repairs its marker without replacing
  // accepted evidence. Parent-link retries are bound to the same request ID.
  const markerMatches = existing?.signedAt && new Date(student.consentAt).getTime() === new Date(existing.signedAt).getTime();
  const repairing = existing?.signature && ((requestId && existing.requestId === requestId) || (!requestId && ((!student.consentAt && !body.baseConsentVersion) || (!markerMatches && body.baseConsentVersion !== undefined && body.baseConsentVersion === existing.previousRevision))));
  let signedAt = repairing ? existing.signedAt : new Date();
  if (!repairing) {
    if (body.baseConsentVersion !== undefined && body.baseConsentVersion !== consentRevision(existing)) return changedConsent();
    if (existing?.signature && body.baseConsentVersion === undefined) {
      return { status: 409, ok: false, code: "ALREADY_SIGNED", message: "يوجد توقيع لهذا الطالب. حدّث الصفحة قبل تعديله." };
    }
    if (existing?.signature) {
      const snapshot = { ...existing, _id: digest(`${studentId}:${consentRevision(existing)}`).slice(0, 24), sourceConsentId: String(existing._id), archivedAt: signedAt };
      try { await ConsentHistoryModelDef.create(snapshot); }
      catch (error) { if (!isDuplicateKey(error)) throw error; }
    }
    const evidence = {
      studentId, tz: student.tz, rulesVersion: rules.version,
      signerName: cleanText(body.signerName, 100), signature: String(body.signature),
      acceptedAt: signedAt, signedAt, recordedBy, requestId, previousRevision: consentRevision(existing), revision: crypto.randomBytes(16).toString("hex"),
    };
    if (existing) {
      const saved = await ConsentModelDef.updateExisting(
        { _id: String(existing._id), signature: existing.signature ?? null, revision: existing.revision ?? null }, evidence,
      );
      if (!saved?.result) return changedConsent();
    } else await ConsentModelDef.create(evidence);
  }
  const marked = await StudentModelDef.updateExisting({ _id: studentId }, { consentAt: signedAt });
  if (!marked?.result) throw new Error("Student disappeared while saving consent");
  notifyChange("student", studentId);
  return { ok: true };
}

// Staff-assisted signing and explicitly versioned updates use the same evidence path.
const signConsent = async (req, res) => {
  try {
    const studentId = String(req.params.studentId);
    const [student] = resultsOf(await StudentModelDef.get({ _id: studentId }));
    if (!student) return res.status(404).json({ ok: false, message: "الطالب غير موجود" });
    const rules = await currentRules();
    if (!rules?.text) return res.status(409).json({ ok: false, code: "NO_RULES", message: "يجب نشر نظام الجمعية أولًا." });
    const problem = consentProblem(req.body, rules);
    if (problem) return res.status(problem.status).json({ ok: false, code: problem.code, message: problem.message });
    const [existing] = resultsOf(await ConsentModelDef.get({ studentId }));
    const result = await saveConsentEvidence(student, existing, req.body, rules, { recordedBy: String(req.actor?.name || "") });
    return res.status(result.status || 200).json(result);
  } catch (err) {
    if (isDuplicateKey(err)) return res.status(409).json({ ok: false, code: "CONSENT_CHANGED", message: "تم تحديث التوقيع. حدّث الصفحة وحاول مرة أخرى." });
    logWithSource("InviteToken.signConsent", err);
    return res.status(500).json({ ok: false, message: "تعذّر حفظ التوقيع" });
  }
};

// A personal, seven-day, one-use capability. Only the digest is stored; the
// browser sends the secret in a POST body, never in a server path/query.
const createConsentLink = async (req, res) => {
  try {
    const studentId = String(req.params.studentId);
    const [student] = resultsOf(await StudentModelDef.get({ _id: studentId }));
    if (!student) return res.status(404).json({ ok: false, message: "الطالب غير موجود" });
    const rules = await currentRules();
    if (!rules?.text) return res.status(409).json({ ok: false, code: "NO_RULES", message: "يجب نشر قوانين الجمعية أولًا." });
    const [existing] = resultsOf(await ConsentModelDef.get({ studentId }));
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * DAY_MS);
    await InviteTokenModelDef.create({ purpose: "student-consent", tokenHash: digest(token), studentId, baseConsentVersion: consentRevision(existing), expiresAt, used: false, createdAt: new Date() });
    res.set("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, token, expiresAt });
  } catch (error) {
    logWithSource("InviteToken.createConsentLink", error);
    return res.status(500).json({ ok: false, message: "تعذّر إنشاء رابط التوقيع" });
  }
};

async function consentLinkContext(token) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(String(token || ""))) return null;
  const [link] = resultsOf(await InviteTokenModelDef.get({ purpose: "student-consent", tokenHash: digest(token), used: false }));
  if (!link || !(new Date(link.expiresAt).getTime() > Date.now())) return null;
  const [student] = resultsOf(await StudentModelDef.get({ _id: String(link.studentId) }));
  if (!student) return null;
  const [existing] = resultsOf(await ConsentModelDef.get({ studentId: String(link.studentId) }));
  if (consentRevision(existing) !== link.baseConsentVersion && existing?.requestId !== link.tokenHash) return null;
  return { link, student, existing };
}

const closedConsentLink = (res) => res.status(410).json({ ok: false, code: "LINK_CLOSED", message: "الرابط غير صالح أو انتهى أو تم استكمال التوقيع. اطلب رابطًا جديدًا من الجمعية." });
const validateConsentLink = async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const context = await consentLinkContext(req.body?.token);
    if (!context) return closedConsentLink(res);
    const rules = await currentRules();
    if (!rules?.text) return res.status(409).json({ ok: false, code: "NO_RULES", message: "التوقيع غير متاح حاليًا. تواصل مع الجمعية." });
    return res.status(200).json({ ok: true, studentName: [context.student.firstname, context.student.lastname].filter(Boolean).join(" "), rules: { version: rules.version, text: rules.text } });
  } catch (error) {
    logWithSource("InviteToken.validateConsentLink", error);
    return res.status(500).json({ ok: false, message: "تعذّر فتح رابط التوقيع" });
  }
};

const submitConsentLink = async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    const context = await consentLinkContext(req.body?.token);
    if (!context) return closedConsentLink(res);
    const rules = await currentRules();
    if (!rules?.text) return res.status(409).json({ ok: false, code: "NO_RULES", message: "التوقيع غير متاح حاليًا. تواصل مع الجمعية." });
    const problem = consentProblem(req.body, rules);
    if (problem) return res.status(problem.status).json({ ok: false, ...problem });
    const { link, student, existing } = context;
    const result = await saveConsentEvidence(student, existing, { ...req.body, baseConsentVersion: link.baseConsentVersion }, rules, { recordedBy: "ولي الأمر عبر رابط التوقيع", requestId: link.tokenHash });
    if (!result.ok) return res.status(result.status || 409).json(result);
    await InviteTokenModelDef.updateExisting({ _id: String(link._id), used: false }, { used: true, usedAt: new Date() });
    return res.status(200).json({ ok: true, message: "تم حفظ موافقتكم وتوقيعكم في ملف الطالب." });
  } catch (error) {
    if (isDuplicateKey(error)) return res.status(409).json(changedConsent());
    logWithSource("InviteToken.submitConsentLink", error);
    return res.status(500).json({ ok: false, message: "تعذّر حفظ التوقيع. حاول مرة أخرى." });
  }
};

/* ================= admin: the link ================= */

const getLink = async (req, res) => {
  try {
    const token = (await getLinkToken()) || (await saveNewToken());
    return res.status(200).json({
      ok: true,
      token,
      usedThisMonth: await countRecentParentRequests(),
      monthlyLimit: MONTHLY_LIMIT,
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
    const rules = await currentRules();
    return res.status(200).json({
      valid: true,
      // Version 0 is the built-in default; a deliberately empty published version closes intake.
      open: Boolean(rules?.text) && (await countRecentParentRequests()) < MONTHLY_LIMIT,
      ...(rules?.text ? { rules: { version: rules.version, text: rules.text } } : { noRules: true }),
    });
  } catch (err) {
    logWithSource("InviteToken.validateToken", err);
    return res.status(500).json({ valid: false, message: "تعذّر التحقق من الرابط" });
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
  if (!fields.health_status) fields.health_status = "سليم";
  fields.layer = canonicalGrade(fields.layer);
  return fields;
}

function registrationError(fields) {
  if (!isValidIsraeliId(fields.tz)) return "رقم الهوية غير صالح";
  if (!fields.firstname || !fields.lastname) return "اسم الطالب واسم العائلة مطلوبان";
  return "";
}

async function savePhoto(tz, file, id) {
  try {
    const uploaded = await handleUpload(
      file,
      StudentModelDef.dbName,
      StudentModelDef.collections.active,
      tz
    );
    if (uploaded?.secure_url) {
      await StudentModelDef.update({ tz }, { photo: uploaded.secure_url });
      if (id) notifyChange("student", id);
      passportPhotoJob.schedule(uploaded.secure_url);
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
        message: "الرابط غير صالح. يُرجى طلب رابط جديد من الجمعية.",
      });
    }

    if ((await countRecentParentRequests()) >= MONTHLY_LIMIT) {
      return res.status(429).json({
        ok: false,
        code: "INTAKE_CLOSED",
        message: "استقبال الطلبات متوقف مؤقتًا. يُرجى المحاولة بعد بضعة أيام.",
      });
    }

    const fields = readRegistration(req.body);
    const error = registrationError(fields);
    if (error) {
      return res.status(400).json({ ok: false, message: error });
    }

    // Checked before the ID, so the answer says nothing about who is registered.
    const rules = await currentRules();
    if (!rules?.text) {
      return res.status(409).json({ ok: false, code: "NO_RULES", message: "لا يمكن استقبال الطلبات قبل نشر نظام الجمعية. يُرجى التواصل مع الجمعية." });
    }
    const problem = consentProblem(req.body, rules);
    if (problem) return res.status(problem.status).json({ ok: false, code: problem.code, message: problem.message });

    // A known ID gets exactly the same reply as a new one, so the public form
    // cannot reveal who is registered.
    const [existing] = resultsOf(await StudentModelDef.get({ tz: fields.tz }));
    if (existing) {
      // Registered or waiting: the same reply, and nothing is saved (owner, 2026-11-05).
      return res.status(200).json({ ok: true, message: RECEIVED_MESSAGE });
    }

    const now = new Date();
    const created = await StudentModelDef.create({
      ...fields,
      photo: "",
      main_teacher: null,
      source: PARENT_SOURCE,
      status: PENDING_STATUS,
      consentAt: req.body.signature ? now : null,
      createdAt: now,
      updatedAt: now,
    });
    // Required agreement and signature are saved before replying.
    // The time is the server's, and a known ID never reaches this point.
    try {
      await ConsentModelDef.create({
        studentId: String(created?.result?._id),
        tz: fields.tz,
        rulesVersion: rules.version,
        signerName: cleanText(req.body.signerName, 100),
        signature: req.body.signature ? String(req.body.signature) : null,
        acceptedAt: now,
        signedAt: req.body.signature ? now : null,
      });
    } catch (consentError) {
      await StudentModelDef.delete({ _id: String(created?.result?._id) });
      throw consentError;
    }
    res.status(200).json({ ok: true, message: RECEIVED_MESSAGE });
    // Announced after replying, like the alert below: open staff lists reload.
    const createdId = created?.result?._id ? String(created.result._id) : null;
    if (createdId) notifyChange("student", createdId);
    // Fire-and-forget, after replying: the alert never delays or changes the
    // answer (and so cannot tell a new ID from a known one by its timing).
    Promise.resolve()
      .then(() => require("../../services/alertEvents").parentRegistered({
        _id: created?.result?._id ? String(created.result._id) : null,
        firstname: fields.firstname,
        lastname: fields.lastname,
      }))
      .catch((alertError) => logWithSource("InviteToken.alert", alertError));

    // Uploaded after replying: the reply must not wait on (or mention) Drive,
    // or its timing would tell a new ID from a known one.
    if (req.file) {
      await savePhoto(fields.tz, req.file, createdId);
    }
  } catch (err) {
    // The same ID was sent twice at once: the second gets the known-ID reply.
    if (isDuplicateKey(err) && !res.headersSent) return res.status(200).json({ ok: true, message: RECEIVED_MESSAGE });
    logWithSource("InviteToken.submitRegistration", err);
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, message: "تعذّر إرسال الطلب. يُرجى المحاولة لاحقًا." });
    }
  }
};

module.exports = {
  getLink,
  rotateLink,
  validateToken,
  submitRegistration,
  getRules,
  publishRules,
  getConsent,
  signConsent,
  createConsentLink, validateConsentLink, submitConsentLink,
};
