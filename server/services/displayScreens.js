// Wall display screens (owner, 2026-11-12). A manager creates a screen (a
// name and a layout) and gets a secret link once; a TV opens the link and
// reads the weekly program through feed(). The link is a capability like the
// parent consent link: only its SHA-256 is stored, and it lives until a new
// link is issued or the screen is deleted. The feed carries lesson name,
// day, times, room and guide name, and nothing else.
const crypto = require("node:crypto");
const { findActive, fullName } = require("../utils/lessonParticipants");

const LAYOUTS = ["week", "today", "rotate", "rooms"];
const MAX_NAME = 60;
const SECRET = /^[A-Za-z0-9_-]{43}$/;

const rows = (res) => (Array.isArray(res?.result) ? res.result : []);
const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const closed = () => fail(410, "LINK_CLOSED", "رابط هذه الشاشة لم يعد صالحًا");
const notFound = () => fail(404, "NOT_FOUND", "الشاشة غير موجودة");

function cleanName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > MAX_NAME) throw fail(400, "BAD_INPUT", `اسم الشاشة مطلوب (حتى ${MAX_NAME} حرفًا)`);
  return name;
}
function cleanLayout(value) {
  if (!LAYOUTS.includes(value)) throw fail(400, "BAD_INPUT", "طريقة العرض غير معروفة");
  return value;
}

const publicScreen = (doc) => ({ id: String(doc._id), name: doc.name, layout: doc.layout, createdAt: doc.createdAt || null });
const auditEntry = (action, doc, extra = {}) => ({
  module: "displays", action, targetType: "displayScreen", targetId: String(doc._id), targetLabel: doc.name, ...extra,
});

// One lesson as the wall shows it, or null when it has no place in the week.
function slot(lesson) {
  const day = Number(lesson?.date?.day);
  const startMin = Number(lesson?.date?.startMin);
  const endMin = Number(lesson?.date?.endMin);
  if (!Number.isInteger(day) || day < 1 || day > 7) return null;
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return null;
  return { day, startMin, endMin };
}
const roomOf = (room) => {
  const value = room == null ? "" : String(room).trim();
  return value && value !== "0" ? value : null;
};

function createDisplayScreens({ screens, lessons, sportLessons, users, audit, now = () => new Date(), randomSecret = () => crypto.randomBytes(32).toString("base64url") }) {
  async function find(id) {
    if (!/^[0-9a-fA-F]{24}$/.test(String(id))) throw notFound();
    const doc = rows(await screens.get({ _id: String(id) }))[0];
    if (!doc) throw notFound();
    return doc;
  }
  const record = (req, entry) => Promise.resolve(audit.record(req, entry)).catch(() => {});

  async function list() {
    return rows(await screens.get({})).map(publicScreen);
  }

  async function create(body = {}, req) {
    const name = cleanName(body.name);
    const layout = cleanLayout(body.layout);
    const secret = randomSecret();
    const stamp = now();
    const res = await screens.create({ name, layout, tokenHash: sha256(secret), createdAt: stamp, updatedAt: stamp });
    const doc = res?.result;
    if (!doc?._id) throw fail(500, "SAVE_FAILED", "تعذّر حفظ الشاشة");
    await record(req, auditEntry("create", doc, { after: { name, layout } }));
    return { screen: publicScreen(doc), secret };
  }

  async function update(id, body = {}, req) {
    const doc = await find(id);
    const patch = {};
    if (body.name !== undefined) patch.name = cleanName(body.name);
    if (body.layout !== undefined) patch.layout = cleanLayout(body.layout);
    if (!Object.keys(patch).length) return { screen: publicScreen(doc) };
    patch.updatedAt = now();
    const saved = (await screens.updateExisting({ _id: String(doc._id) }, patch))?.result;
    if (!saved) throw notFound();
    await record(req, auditEntry("update", saved, {
      before: { name: doc.name, layout: doc.layout }, after: { name: saved.name, layout: saved.layout },
    }));
    return { screen: publicScreen(saved) };
  }

  async function rotate(id, req) {
    const doc = await find(id);
    const secret = randomSecret();
    const saved = (await screens.updateExisting({ _id: String(doc._id) }, { tokenHash: sha256(secret), updatedAt: now() }))?.result;
    if (!saved) throw notFound();
    await record(req, auditEntry("rotateLink", doc));
    return { secret };
  }

  async function remove(id, req) {
    const doc = await find(id);
    await screens.delete({ _id: String(doc._id) });
    await record(req, auditEntry("delete", doc, { before: { name: doc.name, layout: doc.layout } }));
    return {};
  }

  // One lookup per teacher, all at once.
  async function guideNames(list) {
    const ids = [...new Set(list.map((l) => l.teacher).filter((v) => v != null && v !== "").map(String))];
    const found = await Promise.all(ids.map((id) => findActive(users, id)));
    return new Map(ids.map((id, i) => [id, (found[i] && fullName(found[i])) || null]));
  }

  async function feed(secret) {
    if (typeof secret !== "string" || !SECRET.test(secret)) throw closed();
    const doc = rows(await screens.get({ tokenHash: sha256(secret) }))[0];
    if (!doc) throw closed();

    const regular = rows(await lessons.get({}));
    const guides = await guideNames(regular);
    const out = [];
    for (const lesson of regular) {
      const at = slot(lesson);
      if (!at) continue;
      const teacher = lesson.teacher == null ? "" : String(lesson.teacher);
      out.push({ name: String(lesson.name || ""), ...at, room: roomOf(lesson.room), guide: guides.get(teacher) || null, kind: "lesson" });
    }
    for (const lesson of rows(await sportLessons.get({}))) {
      const at = slot(lesson);
      if (!at) continue;
      out.push({ name: String(lesson.name || ""), ...at, room: "9", guide: null, kind: "sport" });
    }
    out.sort((a, b) => a.day - b.day || a.startMin - b.startMin || a.endMin - b.endMin);
    return { name: doc.name, layout: LAYOUTS.includes(doc.layout) ? doc.layout : "week", serverTime: now().toISOString(), lessons: out };
  }

  return { list, create, update, rotate, remove, feed };
}

function defaultDeps() {
  const { DisplayScreenModelDef } = require("../Entities/Display/DisplayScreen.model");
  const { LessonModelDef } = require("../Entities/Lesson/Lesson.model");
  const { SportLessonModelDef } = require("../Entities/Sport/SportLesson.model");
  const { UserModelDef } = require("../Entities/User/User.model");
  const { audit } = require("../utils/audit");
  return { screens: DisplayScreenModelDef, lessons: LessonModelDef, sportLessons: SportLessonModelDef, users: UserModelDef, audit };
}

let shared = null;
const displayScreens = () => {
  if (!shared) shared = createDisplayScreens(defaultDeps());
  return shared;
};

module.exports = { createDisplayScreens, displayScreens, LAYOUTS };
