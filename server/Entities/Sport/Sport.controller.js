const crypto = require("crypto");
const { SportModelDef } = require("./Sport.model");
const { SportPlayerModelDef } = require("./SportPlayer.model");
const { SportLessonModelDef } = require("./SportLesson.model");
const { SportAttendanceModelDef } = require("./SportAttendance.model");
const { StudentModelDef } = require("../Student/Student.model");
const { logWithSource } = require("../../middleware/logger");
const { audit } = require("../../utils/audit");
const { LessonModelDef } = require("../Lesson/Lesson.model");
const { ageOn, buildCard, israelToday, dayOfDate } = require("../../utils/sportCards");
const { conflictsInRoom9 } = require("../../utils/lessonConflict");
const { notifyCardChanged } = require("../../utils/cardPush");
const { checkVersion, editorStamp, sameVersion, nextStamp, raceLost, holderOf, lockedAnswer } = require("../../middleware/lockGuard");
const { notifyChange, liveHub } = require("../../services/liveHub");

const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";
const NOT_FOUND = { student: "الطالب غير موجود", player: "اللاعب غير موجود", lesson: "الدرس غير موجود" };
const SPORT_ROOM = "9";
const DAY_NAMES = ["", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const STATUSES = ["حاضر", "غائب", "متأخر"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FOOTBALL = { name: "كرة القدم", icon: "⚽" };
const MAX_STATS = 4;
const OBJECT_ID = /^[a-f0-9]{24}$/i;
const STAT_KEY = /^[A-Za-z0-9_]{1,40}$/;

const fail = (res, status, message) => res.status(status).json({ ok: false, message });
const handle = (name, fn) => async (req, res) => {
  try {
    return await fn(req, res);
  } catch (err) {
    logWithSource(`Sport.${name}`, err);
    return fail(res, 500, SERVER_ERROR);
  }
};

const text = (v) => String(v ?? "").trim();
const rows = (r) => (r?.success && Array.isArray(r.result) ? r.result : []);
const fullName = (p) => `${p?.firstname || ""} ${p?.lastname || ""}`.trim();
const uniqueIds = (list) => [...new Set((Array.isArray(list) ? list : []).map(String))];

// Tells the students whose sport view changed (their open sport screens
// reload); a no-op when nobody listens.
const tellStudents = (ids) => liveHub.toStudents(uniqueIds(ids), "me");
const playerIdsOf = (lesson) => (lesson?.players || []).map((p) => String(p.studentId));

// _id filters are only built from ids that look like ObjectIds.
async function findOne(model, id) {
  if (!OBJECT_ID.test(String(id || ""))) return null;
  return rows(await model.get({ _id: String(id) }))[0] || null;
}

async function record(req, action, targetType, doc, label, before = null) {
  await audit.record(req, {
    module: "sports", action, targetType, targetId: doc?._id ?? before?._id, targetLabel: label, before, after: doc,
  });
}

/* ---------- football ---------- */

// The one sport. Created on first use; concurrent first calls share one create.
let pendingFootball = null;
async function ensureFootball() {
  if (pendingFootball) return pendingFootball;
  pendingFootball = (async () => {
    try {
      const found = rows(await SportModelDef.get({ name: FOOTBALL.name }))[0];
      if (found) return found;
      const now = new Date();
      const created = await SportModelDef.create({ ...FOOTBALL, stats: [], createdAt: now, updatedAt: now });
      return created?.result;
    } finally {
      pendingFootball = null;
    }
  })();
  return pendingFootball;
}

const presentSport = (s) => ({ _id: String(s._id), name: s.name, icon: s.icon, stats: s.stats || [] });

const getSport = handle("getSport", async (req, res) => {
  const sport = await ensureFootball();
  return res.status(200).json({ ok: true, sport: presentSport(sport) });
});

// Returns { stats } or { error }. A key is kept only when the sport already
// has it; everything else gets a fresh key.
function parseStats(input, current) {
  if (!Array.isArray(input)) return { error: "الإحصائيات غير صحيحة" };
  if (input.length > MAX_STATS) return { error: "الحد الأقصى 4 إحصائيات" };
  const known = new Set((current?.stats || []).map((s) => s.key));
  const used = new Set();
  const stats = [];
  for (const entry of input) {
    const label = text(entry?.label);
    if (!label) return { error: "اسم الإحصائية مطلوب" };
    let key = text(entry?.key);
    if (!known.has(key) || used.has(key)) key = `s_${crypto.randomBytes(4).toString("hex")}`;
    used.add(key);
    stats.push({ key, label });
  }
  return { stats };
}

const setStats = handle("setStats", async (req, res) => {
  const current = await ensureFootball();
  const parsed = parseStats(req.body?.stats, current);
  if (parsed.error) return fail(res, 400, parsed.error);
  const kept = new Set(parsed.stats.map((s) => s.key));
  const removed = (current.stats || []).map((s) => s.key).filter((k) => !kept.has(k));
  const updated = await SportModelDef.updateExisting({ _id: current._id }, { stats: parsed.stats, updatedAt: new Date() });
  const sport = updated?.result;
  await SportPlayerModelDef.unsetStats(removed);
  await record(req, "update", "sport", sport, current.name, current);
  notifyChange("sport", String(current._id));
  tellStudents(rows(await SportPlayerModelDef.get({ sportId: String(current._id) })).map((p) => p.studentId));
  return res.status(200).json({ ok: true, sport: presentSport(sport) });
});

/* ---------- players ---------- */

const studentMap = async () => new Map(rows(await StudentModelDef.get({})).map((s) => [String(s._id), s]));
const inLesson = (lesson, studentId) => (lesson.players || []).some((p) => String(p.studentId) === String(studentId));

// Puts one student on (want) or off a lesson's roster without losing a roster
// change made at the same time: the write is compare-and-set on updatedAt and,
// when someone else wrote first, is redone on the fresh roster. Answers
// { lesson, changed } (lesson: as stored after the write; null if it is gone).
async function setMembership(lesson, studentId, want, stamp = {}) {
  let current = lesson;
  for (let attempt = 0; attempt < 5 && current; attempt += 1) {
    if (inLesson(current, studentId) === want) return { lesson: current, changed: false };
    // Always later than the version read, so a stale contender never matches it.
    const now = nextStamp(current, Date.now());
    const players = want
      ? [...(current.players || []), { studentId, joinedAt: new Date() }]
      : (current.players || []).filter((p) => String(p.studentId) !== String(studentId));
    const written = (await SportLessonModelDef.updateExisting(sameVersion({ _id: current._id }, current), { players, updatedAt: now, ...stamp }))?.result;
    if (written) return { lesson: written, changed: true };
    current = rows(await SportLessonModelDef.get({ _id: current._id }))[0] || null;
  }
  if (!current) return { lesson: null, changed: false };
  throw new Error("sport roster kept changing; not written");
}

// The first lesson (of `ids`) another tab holds open, as the 423 body; or null.
async function heldLesson(req, ids) {
  for (const id of ids) {
    const holder = await holderOf(`sportLesson:${id}`, req.get?.("X-Client-Id"));
    if (holder) return lockedAnswer(holder);
  }
  return null;
}

// "YYYY-MM-DD" from a stored birth date, or null.
function birthDateOf(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const listPlayers = handle("listPlayers", async (req, res) => {
  const sport = await ensureFootball();
  const sportId = String(sport._id);
  const [players, students, lessons] = await Promise.all([
    SportPlayerModelDef.get({ sportId }), studentMap(), SportLessonModelDef.get({ sportId }),
  ]);
  const lessonRows = rows(lessons);
  const lessonIds = lessonRows.map((l) => String(l._id));
  const records = lessonIds.length ? rows(await SportAttendanceModelDef.get({ sportLessonId: { $in: lessonIds } })) : [];
  const now = new Date();
  const out = [];
  for (const p of rows(players)) {
    const s = students.get(String(p.studentId));
    if (!s) continue;
    const card = buildCard({ player: p, sport, lessons: lessonRows, records });
    out.push({
      studentId: String(p.studentId), firstname: s.firstname, lastname: s.lastname, age: ageOn(s.birth_date, now),
      gender: s.gender, layer: s.layer || "", school: s.school || "",
      tz: String(s.tz || ""), photo: s.photo || "", birthDate: birthDateOf(s.birth_date),
      jerseyNumber: card.jerseyNumber, position: card.position,
      lessons: lessonRows.filter((l) => inLesson(l, p.studentId))
        .map((l) => ({ _id: String(l._id), name: l.name, day: l.date?.day, startMin: l.date?.startMin })),
      values: card.values, attendance: card.attendance,
    });
  }
  return res.status(200).json({ ok: true, players: out });
});

// q matches the ID number (digits) or the name; an empty q lists every student.
const searchStudents = handle("searchStudents", async (req, res) => {
  const needle = text(req.query?.q).toLowerCase();
  const layer = text(req.query?.layer);
  const gender = text(req.query?.gender);
  const school = text(req.query?.school);
  const sport = await ensureFootball();
  const playerIds = new Set(rows(await SportPlayerModelDef.get({ sportId: String(sport._id) })).map((p) => String(p.studentId)));
  const now = new Date();
  const students = rows(await StudentModelDef.get({}))
    .filter((s) => !needle || [String(s.tz || ""), s.firstname, s.lastname, fullName(s)].some((v) => String(v || "").toLowerCase().includes(needle)))
    .filter((s) => (!layer || s.layer === layer) && (!gender || s.gender === gender) && (!school || s.school === school))
    .sort((a, b) => fullName(a).localeCompare(fullName(b), "ar"))
    .map((s) => ({
      _id: String(s._id), firstname: s.firstname, lastname: s.lastname, tz: String(s.tz || ""), photo: s.photo || "",
      age: ageOn(s.birth_date, now), gender: s.gender, layer: s.layer || "", school: s.school || "",
      isPlayer: playerIds.has(String(s._id)),
    }));
  return res.status(200).json({ ok: true, students });
});

const savePlayer = handle("savePlayer", async (req, res) => {
  const student = await findOne(StudentModelDef, req.params.studentId);
  if (!student) return fail(res, 404, NOT_FOUND.student);
  const raw = req.body?.jerseyNumber;
  let jerseyNumber = null;
  if (raw !== null && raw !== undefined && raw !== "") {
    jerseyNumber = Number(raw);
    if (!Number.isInteger(jerseyNumber) || jerseyNumber < 1 || jerseyNumber > 99) return fail(res, 400, "رقم القميص يجب أن يكون عددًا من 1 إلى 99");
  }
  const position = text(req.body?.position);
  if ([...position].length > 30) return fail(res, 400, "المركز طويل جدًا (حتى 30 حرفًا)");
  if (req.body?.lessonIds !== undefined && !Array.isArray(req.body.lessonIds)) return fail(res, 400, "قائمة الدروس غير صحيحة");
  const wanted = new Set(uniqueIds(req.body?.lessonIds));

  const sport = await ensureFootball();
  const sportId = String(sport._id);
  const studentId = String(student._id);
  const lessons = rows(await SportLessonModelDef.get({ sportId }));
  const known = new Set(lessons.map((l) => String(l._id)));
  if ([...wanted].some((id) => !known.has(id))) return fail(res, 400, "درس غير موجود");

  // The rosters this save changes must not be open in another tab.
  const toChange = lessons.filter((lesson) => inLesson(lesson, studentId) !== wanted.has(String(lesson._id)));
  const held = await heldLesson(req, toChange.map((lesson) => String(lesson._id)));
  if (held) return res.status(423).json(held);

  const existing = rows(await SportPlayerModelDef.get({ studentId, sportId }))[0];
  const now = new Date();
  const saved = existing
    ? await SportPlayerModelDef.updateExisting({ _id: existing._id }, { jerseyNumber, position, updatedAt: now })
    : await SportPlayerModelDef.create({ studentId, sportId, jerseyNumber, position, stats: {}, createdAt: now, updatedAt: now });

  const changedLessons = [];
  for (const lesson of toChange) {
    const { changed } = await setMembership(lesson, studentId, wanted.has(String(lesson._id)));
    if (changed) changedLessons.push(String(lesson._id));
  }
  await record(req, existing ? "update" : "create", "player", saved?.result, fullName(student), existing || null);
  notifyChange("player", studentId);
  for (const lessonId of changedLessons) notifyChange("sportLesson", lessonId);
  tellStudents([studentId]);
  return res.status(200).json({ ok: true, player: saved?.result });
});

const deletePlayer = handle("deletePlayer", async (req, res) => {
  const studentId = String(req.params.studentId);
  const sport = await ensureFootball();
  const sportId = String(sport._id);
  const existing = rows(await SportPlayerModelDef.get({ studentId, sportId }))[0];
  if (!existing) return fail(res, 404, NOT_FOUND.player);
  const memberOf = rows(await SportLessonModelDef.get({ sportId })).filter((lesson) => inLesson(lesson, studentId));
  const held = await heldLesson(req, memberOf.map((lesson) => String(lesson._id)));
  if (held) return res.status(423).json(held);
  await SportPlayerModelDef.delete({ _id: existing._id });
  // Attendance rows stay: they are history.
  const changedLessons = [];
  for (const lesson of memberOf) {
    const { changed } = await setMembership(lesson, studentId, false);
    if (changed) changedLessons.push(String(lesson._id));
  }
  await record(req, "delete", "player", null, studentId, existing);
  notifyChange("player", studentId);
  for (const lessonId of changedLessons) notifyChange("sportLesson", lessonId);
  tellStudents([studentId]);
  return res.status(200).json({ ok: true });
});

const bumpStat = handle("bumpStat", async (req, res) => {
  const key = text(req.body?.key);
  const delta = Number(req.body?.delta);
  if (delta !== 1 && delta !== -1) return fail(res, 400, "التغيير يجب أن يكون +1 أو −1");
  const sport = await ensureFootball();
  if (!STAT_KEY.test(key) || !(sport.stats || []).some((s) => s.key === key)) return fail(res, 400, "الإحصائية غير معرّفة");
  const player = rows(await SportPlayerModelDef.get({ studentId: String(req.params.studentId), sportId: String(sport._id) }))[0];
  if (!player) return fail(res, 404, NOT_FOUND.player);
  const value = await SportPlayerModelDef.bumpStat(player._id, key, delta);
  cardChanged([String(player.studentId)]);
  notifyChange("player", String(player.studentId));
  tellStudents([player.studentId]);
  return res.status(200).json({ ok: true, value });
});

// Fire and forget: a push problem never reaches the response.
function cardChanged(studentIds) {
  try {
    Promise.resolve(notifyCardChanged(studentIds)).catch((err) => logWithSource("cardChanged failed:", err?.message || err));
  } catch (err) {
    logWithSource("cardChanged failed:", err?.message || err);
  }
}

/* ---------- lessons ---------- */

const CONFLICT = "يوجد تعارض";
const BAD_ATTENDANCE_DATE = "لا يمكن تسجيل الحضور في هذا التاريخ";

const isMinute = (n) => Number.isInteger(n) && n >= 0 && n <= 1440;

const pad2 = (n) => String(n).padStart(2, "0");
const generatedName = (date) => `${FOOTBALL.name} · ${DAY_NAMES[date.day]} ${pad2(Math.floor(date.startMin / 60))}:${pad2(date.startMin % 60)}`;

// Returns { name, date } or { error }. A missing or blank name is generated.
function parseLesson(body) {
  const name = text(body?.name);
  if ([...name].length > 60) return { error: "اسم الدرس طويل جدًا (حتى 60 حرفًا)" };
  const day = Number(body?.date?.day);
  const startMin = Number(body?.date?.startMin);
  const endMin = Number(body?.date?.endMin);
  if (!Number.isInteger(day) || day < 1 || day > 7) return { error: "اليوم غير صحيح" };
  if (!isMinute(startMin) || !isMinute(endMin) || startMin >= endMin) return { error: "وقت الدرس غير صحيح" };
  if (body?.studentIds !== undefined && !Array.isArray(body.studentIds)) return { error: "قائمة اللاعبين غير صحيحة" };
  const date = { day, startMin, endMin };
  return { name, date };
}

async function lessonPlayers(lesson, students) {
  const map = students || await studentMap();
  // A player whose student no longer exists is skipped, so no blank-name row appears.
  return (lesson.players || []).filter((p) => map.has(String(p.studentId))).map((p) => {
    const s = map.get(String(p.studentId));
    return { studentId: String(p.studentId), firstname: s.firstname || "", lastname: s.lastname || "", joinedAt: p.joinedAt };
  });
}

const presentLesson = (lesson, players) => ({
  _id: String(lesson._id), name: lesson.name, nameGenerated: Boolean(lesson.nameGenerated), date: lesson.date, room: lesson.room || SPORT_ROOM, players,
});

const byStart = (a, b) => (a.date?.startMin || 0) - (b.date?.startMin || 0);

const listLessons = handle("listLessons", async (req, res) => {
  const sport = await ensureFootball();
  const [found, students] = await Promise.all([SportLessonModelDef.get({ sportId: String(sport._id) }), studentMap()]);
  const lessons = [];
  for (const l of rows(found).sort((a, b) => (a.date?.day || 0) - (b.date?.day || 0) || byStart(a, b))) {
    lessons.push(presentLesson(l, await lessonPlayers(l, students)));
  }
  return res.status(200).json({ ok: true, lessons });
});

// Shared by create and update. `current` is the lesson being edited, if any.
async function saveLesson(req, res, current) {
  // A form saved on top of a newer version is refused (the screen keeps the draft).
  const stale = current ? checkVersion(current, req) : null;
  if (stale) return res.status(409).json(stale);
  const parsed = parseLesson(req.body);
  if (parsed.error) return fail(res, 400, parsed.error);
  const sport = await ensureFootball();
  const sportId = String(sport._id);
  // Without studentIds the roster is untouched (the lesson form has no players).
  const wanted = req.body.studentIds === undefined
    ? (current?.players || []).map((p) => String(p.studentId))
    : uniqueIds(req.body.studentIds);
  const playerIds = new Set(rows(await SportPlayerModelDef.get({ sportId })).map((p) => String(p.studentId)));
  if (wanted.some((id) => !playerIds.has(id))) return fail(res, 400, "اللاعبون المحددون غير صحيحين");

  const [regular, sportLessons] = await Promise.all([
    LessonModelDef.get({ "date.day": parsed.date.day }), SportLessonModelDef.get({}),
  ]);
  const candidate = { date: parsed.date, room: SPORT_ROOM };
  if (conflictsInRoom9(candidate, { lessons: rows(regular), sportLessons: rows(sportLessons), ignoreId: current?._id })) {
    return fail(res, 409, CONFLICT);
  }

  const now = new Date();
  const kept = new Map((current?.players || []).map((p) => [String(p.studentId), p.joinedAt]));
  const players = wanted.map((studentId) => ({ studentId, joinedAt: kept.get(studentId) || now }));
  const { date } = parsed;
  // A blank name is generated; on update it is regenerated only if the stored name was generated.
  let name = parsed.name;
  let nameGenerated = false;
  if (!name) {
    if (current && !current.nameGenerated) name = current.name;
    else { name = generatedName(date); nameGenerated = true; }
  }
  const saved = current
    // Written only if nobody saved the lesson (or its roster) since it was read.
    // (A strictly later stamp: a roster change may have stamped this lesson ahead of the clock.)
    ? await SportLessonModelDef.updateExisting(sameVersion({ _id: current._id }, current), { name, nameGenerated, date, room: SPORT_ROOM, players, updatedAt: nextStamp(current, now.getTime()), ...editorStamp(req) })
    : await SportLessonModelDef.create({ sportId, name, nameGenerated, date, room: SPORT_ROOM, players, createdAt: now, updatedAt: now, ...editorStamp(req) });
  if (current && !saved?.result) return res.status(409).json(await raceLost(() => SportLessonModelDef.get({ _id: current._id })));
  const lesson = saved?.result;
  await record(req, current ? "update" : "create", "lesson", lesson, parsed.name, current || null);
  notifyChange("sportLesson", String(lesson._id));
  tellStudents([...playerIdsOf(current), ...playerIdsOf(lesson)]);
  return res.status(current ? 200 : 201).json({ ok: true, lesson: presentLesson(lesson, await lessonPlayers(lesson)) });
}

const createLesson = handle("createLesson", (req, res) => saveLesson(req, res, null));

const updateLesson = handle("updateLesson", async (req, res) => {
  const current = await findOne(SportLessonModelDef, req.params.id);
  if (!current) return fail(res, 404, NOT_FOUND.lesson);
  return saveLesson(req, res, current);
});

const deleteLesson = handle("deleteLesson", async (req, res) => {
  const current = await findOne(SportLessonModelDef, req.params.id);
  if (!current) return fail(res, 404, NOT_FOUND.lesson);
  await SportAttendanceModelDef.delete({ sportLessonId: String(current._id) });
  await SportLessonModelDef.delete({ _id: current._id });
  await record(req, "delete", "lesson", null, current.name, current);
  notifyChange("sportLesson", String(current._id));
  tellStudents(playerIdsOf(current));
  return res.status(200).json({ ok: true });
});

/* ---------- roster ---------- */

// Adds any student to the lesson; a student who is not yet a player becomes one.
const addLessonPlayer = handle("addLessonPlayer", async (req, res) => {
  const lesson = await findOne(SportLessonModelDef, req.params.id);
  if (!lesson) return fail(res, 404, NOT_FOUND.lesson);
  const student = await findOne(StudentModelDef, req.body?.studentId);
  if (!student) return fail(res, 404, NOT_FOUND.student);
  const sport = await ensureFootball();
  const sportId = String(sport._id);
  const studentId = String(student._id);
  const now = new Date();
  let player = rows(await SportPlayerModelDef.get({ studentId, sportId }))[0];
  if (!player) {
    player = (await SportPlayerModelDef.create({ studentId, sportId, jerseyNumber: null, position: "", stats: {}, createdAt: now, updatedAt: now }))?.result;
    await record(req, "create", "player", player, fullName(student));
    notifyChange("player", studentId);
  }
  const { lesson: after, changed } = await setMembership(lesson, studentId, true, editorStamp(req));
  if (!after) return fail(res, 404, NOT_FOUND.lesson);
  const current = after;
  if (changed) {
    await record(req, "update", "lesson", current, lesson.name, lesson);
    notifyChange("sportLesson", String(lesson._id));
  }
  tellStudents([studentId, ...playerIdsOf(current)]);
  return res.status(200).json({ ok: true, lesson: presentLesson(current, await lessonPlayers(current)) });
});

// Removes the student from this lesson only; attendance and the player row stay.
const removeLessonPlayer = handle("removeLessonPlayer", async (req, res) => {
  const lesson = await findOne(SportLessonModelDef, req.params.id);
  if (!lesson) return fail(res, 404, NOT_FOUND.lesson);
  const studentId = String(req.params.studentId);
  const { lesson: current, changed } = await setMembership(lesson, studentId, false, editorStamp(req));
  if (!current) return fail(res, 404, NOT_FOUND.lesson);
  if (changed) {
    await record(req, "update", "lesson", current, lesson.name, lesson);
    notifyChange("sportLesson", String(lesson._id));
  }
  tellStudents([studentId, ...playerIdsOf(lesson)]);
  return res.status(200).json({ ok: true, lesson: presentLesson(current, await lessonPlayers(current)) });
});

/* ---------- attendance ---------- */

// "Today" is read from `new Date()` at call time, so tests can stub the clock.
// A real calendar date, not after today (Israel time), on the lesson's weekday.
function validAttendanceDate(date, lesson) {
  if (!DATE_RE.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return false;
  return date <= israelToday(new Date()) && dayOfDate(date) === lesson.date?.day;
}

const getAttendance = handle("getAttendance", async (req, res) => {
  const lesson = await findOne(SportLessonModelDef, req.params.id);
  if (!lesson) return fail(res, 404, NOT_FOUND.lesson);
  const date = text(req.query?.date) || israelToday(new Date());
  if (!validAttendanceDate(date, lesson)) return fail(res, 400, BAD_ATTENDANCE_DATE);
  const marked = new Map(rows(await SportAttendanceModelDef.get({ sportLessonId: String(lesson._id), date }))
    .map((r) => [String(r.studentId), r.status]));
  const players = (await lessonPlayers(lesson)).map((p) => ({
    studentId: p.studentId, firstname: p.firstname, lastname: p.lastname, status: marked.get(p.studentId) || null,
  }));
  return res.status(200).json({ ok: true, date, players });
});

const saveAttendance = handle("saveAttendance", async (req, res) => {
  const lesson = await findOne(SportLessonModelDef, req.params.id);
  if (!lesson) return fail(res, 404, NOT_FOUND.lesson);
  const date = text(req.body?.date);
  if (!validAttendanceDate(date, lesson)) return fail(res, 400, BAD_ATTENDANCE_DATE);
  const marks = req.body?.marks;
  if (!Array.isArray(marks)) return fail(res, 400, "بيانات الحضور غير صحيحة");
  for (const m of marks) {
    if (!inLesson(lesson, m?.studentId)) return fail(res, 400, "الطالب ليس في هذا الدرس");
    if (!STATUSES.includes(m?.status)) return fail(res, 400, "حالة الحضور غير صحيحة");
  }
  const sportLessonId = String(lesson._id);
  const now = new Date();
  // The last mark for a student wins.
  const latest = new Map(marks.map((m) => [String(m.studentId), m.status]));
  const actorId = String(req.actor.id);
  const overwritten = [];
  for (const [studentId, status] of latest) {
    const existing = rows(await SportAttendanceModelDef.get({ sportLessonId, studentId, date }))[0];
    if (existing && existing.status !== status && existing.updatedBy && String(existing.updatedBy) !== actorId) overwritten.push(studentId);
    if (existing) await SportAttendanceModelDef.updateExisting({ _id: existing._id }, { status, ...editorStamp(req), updatedAt: now });
    else await SportAttendanceModelDef.create({ sportLessonId, studentId, date, status, ...editorStamp(req), createdAt: now, updatedAt: now });
  }
  cardChanged([...latest.keys()]);
  await record(req, "update", "attendance", { _id: lesson._id, date, count: latest.size }, lesson.name);
  notifyChange("sportAttendance", `${sportLessonId}:${date}`);
  tellStudents([...latest.keys()]);
  return res.status(200).json({ ok: true, overwritten });
});

const todayLessons = handle("todayLessons", async (req, res) => {
  const sport = await ensureFootball();
  const date = israelToday(new Date());
  const day = dayOfDate(date);
  const lessons = rows(await SportLessonModelDef.get({ sportId: String(sport._id) }))
    .filter((l) => l.date?.day === day)
    .sort(byStart)
    .map((l) => ({ _id: String(l._id), name: l.name, date: l.date }));
  return res.status(200).json({ ok: true, date, lessons });
});

module.exports = {
  ensureFootball, getSport, setStats, listPlayers, searchStudents, savePlayer, deletePlayer, bumpStat,
  listLessons, createLesson, updateLesson, deleteLesson, addLessonPlayer, removeLessonPlayer, getAttendance, saveAttendance, todayLessons,
};
