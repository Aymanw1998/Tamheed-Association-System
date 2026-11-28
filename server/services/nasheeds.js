// The nasheed library (owner, 2026-11-27). A nasheed is a title and ordered
// lines: a verse with its صدر and عجز side by side, a centered line, or the
// *** break between stanzas. Tashkeel is kept as typed. Every create, edit and
// delete writes an audit row; an edit is saved only over the version it was
// read from; a delete goes to the recycle bin («سلة المحذوفات») for 30 days.
const { nextStamp } = require("../middleware/lockGuard");

const LIMITS = { title: 120, text: 200, lines: 300 };
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

const rows = (res) => (Array.isArray(res?.result) ? res.result : []);
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const badInput = (message) => fail(400, "BAD_INPUT", message);
const notFound = () => fail(404, "NOT_FOUND", "النشيد غير موجود");
const stale = () => fail(409, "STALE", "تغيّر النشيد في هذه الأثناء. أعد التحميل.");

// For search: no tashkeel or tatweel, one alif, ي for ى, ه for ة, lower case.
// The app keeps a copy (apps/nasheed/src/arabic.js).
function normalizeArabic(value) {
  return String(value ?? "")
    .replace(/[ً-ٰٟۖ-ۭـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase();
}

const clean = (value) => (typeof value === "string" ? value.trim() : "");

function cleanText(value, what) {
  const text = clean(value);
  if (text.length > LIMITS.text) throw badInput(`${what} أطول من ${LIMITS.text} حرفًا`);
  return text;
}

function cleanTitle(value) {
  const title = clean(value);
  if (!title || title.length > LIMITS.title) throw badInput(`العنوان مطلوب (حتى ${LIMITS.title} حرفًا)`);
  return title;
}

// Empty rows are dropped; only the known fields of each kind are kept.
function cleanLines(value) {
  if (!Array.isArray(value)) throw badInput("أبيات النشيد مطلوبة");
  if (value.length > LIMITS.lines) throw badInput(`النشيد أطول من ${LIMITS.lines} سطرًا`);
  const out = [];
  value.forEach((line, i) => {
    const n = i + 1;
    switch (line?.kind) {
      case "verse": {
        const sadr = cleanText(line.sadr, `صدر البيت ${n}`);
        const ajuz = cleanText(line.ajuz, `عجز البيت ${n}`);
        if (!sadr && !ajuz) return;
        if (!sadr || !ajuz) throw badInput(`البيت ${n} يحتاج الصدر والعجز`);
        out.push({ kind: "verse", sadr, ajuz });
        return;
      }
      case "center": {
        const text = cleanText(line.text, `السطر ${n}`);
        if (text) out.push({ kind: "center", text });
        return;
      }
      case "break":
        out.push({ kind: "break" });
        return;
      default:
        throw badInput(`نوع السطر ${n} غير معروف`);
    }
  });
  if (!out.some((line) => line.kind !== "break")) throw badInput("اكتب سطرًا واحدًا على الأقل");
  return out;
}

const view = (doc) => ({ _id: String(doc._id), title: doc.title, lines: doc.lines || [], updatedAt: doc.updatedAt || null });
const who = (req) => ({ tz: String(req?.actor?.tz || ""), name: req?.actor?.name || "" });
const auditEntry = (action, doc, extra = {}) => ({
  module: "nasheeds", action, targetType: "nasheed", targetId: String(doc._id), targetLabel: doc.title, ...extra,
});
const byTitle = (a, b) => String(a.title).localeCompare(String(b.title), "ar");

function createNasheeds({ nasheeds, bin, audit, now = () => new Date() }) {
  const record = (req, entry) => Promise.resolve(audit.record(req, entry)).catch(() => {});

  async function find(id) {
    if (!OBJECT_ID.test(String(id))) throw notFound();
    const doc = rows(await nasheeds.get({ _id: String(id) }))[0];
    if (!doc) throw notFound();
    return doc;
  }

  async function list() {
    return rows(await nasheeds.get({})).map(view).sort(byTitle);
  }

  async function get(id) {
    return view(await find(id));
  }

  async function create(body = {}, req) {
    const title = cleanTitle(body.title);
    const lines = cleanLines(body.lines);
    const at = now();
    const created = await nasheeds.create({ title, lines, createdBy: who(req), updatedBy: who(req), createdAt: at, updatedAt: at });
    const doc = created?.result;
    if (!doc?._id) throw new Error("nasheed was not created");
    await record(req, auditEntry("create", doc));
    return view(doc);
  }

  async function update(id, body = {}, req) {
    const current = await find(id);
    const title = cleanTitle(body.title);
    const lines = cleanLines(body.lines);
    if (!body.updatedAt || new Date(body.updatedAt).getTime() !== new Date(current.updatedAt).getTime()) throw stale();
    const patch = { title, lines, updatedBy: who(req), updatedAt: nextStamp(current, now().getTime()) };
    const saved = await nasheeds.updateExisting({ _id: String(current._id), updatedAt: current.updatedAt }, patch);
    if (!saved?.result) throw stale();
    await record(req, auditEntry("update", saved.result, { before: view(current), after: view(saved.result) }));
    return view(saved.result);
  }

  async function remove(id, req) {
    const current = await find(id);
    const trashId = await bin.put("nasheed", { refId: current._id, label: current.title, data: current, actor: req?.actor });
    const deleted = await nasheeds.delete({ _id: String(current._id), updatedAt: current.updatedAt });
    if (!deleted?.result?.deletedCount) {
      await bin.drop(trashId);
      throw stale();
    }
    await record(req, auditEntry("delete", current));
    return { trashId };
  }

  // The recycle bin's steps for this kind (services/recycleBin.js).
  const trashHooks = {
    async restore(entry) {
      const doc = entry?.data || {};
      if (rows(await nasheeds.get({ _id: String(doc._id) })).length) {
        return { ok: false, status: 409, code: "EXISTS", message: "النشيد موجود مسبقًا" };
      }
      await nasheeds.create(doc);
      return { ok: true };
    },
    async purge() {
      return { failed: 0 };
    },
  };

  return { list, get, create, update, remove, trashHooks };
}

function defaultDeps() {
  const { NasheedModelDef } = require("../Entities/Nasheed/Nasheed.model");
  const { recycleBin } = require("./recycleBin");
  const { audit } = require("../utils/audit");
  return { nasheeds: NasheedModelDef, bin: recycleBin, audit };
}

let shared = null;
const nasheedLibrary = () => {
  if (!shared) shared = createNasheeds(defaultDeps());
  return shared;
};

module.exports = { createNasheeds, nasheedLibrary, normalizeArabic, LIMITS };
