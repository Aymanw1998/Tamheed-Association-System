// Who looked at a student's sensitive details (owner, 2026-11-16): health,
// the parents' phones, and the parent's signature. One row per look, kept one
// year, shown on the IT site («سجل الاطلاع»). Only the fact of the look is
// kept, never the details themselves.
//
// Row: at (Date), actor (tz), actorName, studentId, studentLabel, fields [].
// The same person opening the same student again within 10 minutes (a save,
// a refresh, the edit page) is not written again.
const api = require("../Entities/api");
const { logWithSource } = require("../middleware/logger");

const dbName = process.env.DB_NAME || "tamheed_db";
const SensitiveViewModelDef = { dbName, collection: "SensitiveViews" };
const KEEP_DAYS = 365;
const REPEAT_MS = 10 * 60 * 1000;
const PAGE_SIZE = 50;

// Student fields that count as sensitive, with the IT site's names.
const STUDENT_FIELDS = ["health_status", "father_phone", "mother_phone"];
const FIELD_TEXT = { health_status: "الحالة الصحية", father_phone: "هاتف الأب", mother_phone: "هاتف الأم", signature: "توقيع ولي الأمر" };

const filled = (value) => value !== undefined && value !== null && String(value).trim() !== "";
// The sensitive fields this student record actually carries (empty ones are not a look).
const sensitiveFieldsOf = (student) => STUDENT_FIELDS.filter((field) => filled(student?.[field]));

function createSensitiveViews({
  create = (data) => api.create({ dbName, collection: SensitiveViewModelDef.collection, data }),
  readPage = (args) => api.readPage({ dbName, collection: SensitiveViewModelDef.collection, ...args }),
  now = () => new Date(),
  log = logWithSource,
} = {}) {
  const recent = new Map();

  // Never throws: a failed row must not stop the page from opening.
  async function record(req, { studentId, studentLabel, fields }) {
    try {
      const list = (fields || []).filter(Boolean);
      const actor = req?.actor;
      if (!list.length || !actor || !studentId) return false;
      const who = actor.isSystem ? "system" : String(actor.tz || "");
      const key = `${who}|${studentId}|${list.join(",")}`;
      const at = now();
      const last = recent.get(key);
      if (last && at.getTime() - last < REPEAT_MS) return false;
      recent.set(key, at.getTime());
      if (recent.size > 5000) recent.clear();
      await create({
        at,
        actor: who,
        actorName: actor.isSystem ? "النظام" : actor.name || who,
        ...(actor.hidden === true ? { realActor: String(actor.tz || "") } : {}),
        studentId: String(studentId),
        studentLabel: String(studentLabel || ""),
        fields: list,
      });
      return true;
    } catch (err) {
      log("sensitiveViews.record", err);
      return false;
    }
  }

  // Newest first; { items, total }.
  async function page({ page: number = 1, studentId, actor } = {}) {
    const filter = {};
    if (studentId) filter.studentId = String(studentId);
    if (actor) filter.actor = String(actor);
    const res = await readPage({ filter, sort: { at: -1, _id: -1 }, skip: (number - 1) * PAGE_SIZE, limit: PAGE_SIZE });
    return { items: res?.result || [], total: res?.total || 0, pageSize: PAGE_SIZE };
  }

  return { record, page };
}

const sensitiveViews = createSensitiveViews();

const TTL_INDEX = { key: { at: 1 }, options: { expireAfterSeconds: KEEP_DAYS * 24 * 60 * 60 } };
async function ensureSensitiveViewIndexes(collection) {
  const target = collection || require("mongoose").connection
    .useDb(dbName, { useCache: true })
    .collection(SensitiveViewModelDef.collection);
  await target.createIndex(TTL_INDEX.key, TTL_INDEX.options);
  await target.createIndex({ studentId: 1, at: -1 });
}

module.exports = {
  createSensitiveViews, sensitiveViews, sensitiveFieldsOf, ensureSensitiveViewIndexes,
  STUDENT_FIELDS, FIELD_TEXT, KEEP_DAYS, REPEAT_MS, TTL_INDEX,
};
