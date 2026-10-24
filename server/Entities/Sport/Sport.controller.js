const crypto = require("crypto");
const { SportModelDef } = require("./Sport.model");
const { SportPlayerModelDef } = require("./SportPlayer.model");
const { SportLessonModelDef } = require("./SportLesson.model");
const { SportAttendanceModelDef } = require("./SportAttendance.model");
const { StudentModelDef } = require("../Student/Student.model");
const { logWithSource } = require("../../middleware/logger");
const { audit } = require("../../utils/audit");
const { ageOn, buildCard } = require("../../utils/sportCards");

const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";
const NOT_FOUND = { student: "الطالب غير موجود", player: "اللاعب غير موجود" };
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
  return res.status(200).json({ ok: true, sport: presentSport(sport) });
});

/* ---------- players ---------- */

const studentMap = async () => new Map(rows(await StudentModelDef.get({})).map((s) => [String(s._id), s]));
const inLesson = (lesson, studentId) => (lesson.players || []).some((p) => String(p.studentId) === String(studentId));

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
      jerseyNumber: card.jerseyNumber, position: card.position,
      lessons: lessonRows.filter((l) => inLesson(l, p.studentId))
        .map((l) => ({ _id: String(l._id), name: l.name, day: l.date?.day, startMin: l.date?.startMin })),
      values: card.values, attendance: card.attendance,
    });
  }
  return res.status(200).json({ ok: true, players: out });
});

// Name only: ids (tz) are never matched and never returned.
const searchStudents = handle("searchStudents", async (req, res) => {
  const q = text(req.query?.q);
  if ([...q].length < 2) return res.status(200).json({ ok: true, students: [] });
  const needle = q.toLowerCase();
  const layer = text(req.query?.layer);
  const gender = text(req.query?.gender);
  const school = text(req.query?.school);
  const sport = await ensureFootball();
  const playerIds = new Set(rows(await SportPlayerModelDef.get({ sportId: String(sport._id) })).map((p) => String(p.studentId)));
  const now = new Date();
  const students = rows(await StudentModelDef.get({}))
    .filter((s) => [s.firstname, s.lastname, fullName(s)].some((v) => String(v || "").toLowerCase().includes(needle)))
    .filter((s) => (!layer || s.layer === layer) && (!gender || s.gender === gender) && (!school || s.school === school))
    .slice(0, 20)
    .map((s) => ({
      _id: String(s._id), firstname: s.firstname, lastname: s.lastname, age: ageOn(s.birth_date, now),
      gender: s.gender, layer: s.layer || "", school: s.school || "", isPlayer: playerIds.has(String(s._id)),
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

  const existing = rows(await SportPlayerModelDef.get({ studentId, sportId }))[0];
  const now = new Date();
  const saved = existing
    ? await SportPlayerModelDef.updateExisting({ _id: existing._id }, { jerseyNumber, position, updatedAt: now })
    : await SportPlayerModelDef.create({ studentId, sportId, jerseyNumber, position, stats: {}, createdAt: now, updatedAt: now });

  for (const lesson of lessons) {
    const member = inLesson(lesson, studentId);
    const want = wanted.has(String(lesson._id));
    if (want === member) continue;
    const players = want
      ? [...(lesson.players || []), { studentId, joinedAt: now }]
      : (lesson.players || []).filter((p) => String(p.studentId) !== studentId);
    await SportLessonModelDef.updateExisting({ _id: lesson._id }, { players, updatedAt: now });
  }
  await record(req, existing ? "update" : "create", "player", saved?.result, fullName(student), existing || null);
  return res.status(200).json({ ok: true, player: saved?.result });
});

const deletePlayer = handle("deletePlayer", async (req, res) => {
  const studentId = String(req.params.studentId);
  const sport = await ensureFootball();
  const sportId = String(sport._id);
  const existing = rows(await SportPlayerModelDef.get({ studentId, sportId }))[0];
  if (!existing) return fail(res, 404, NOT_FOUND.player);
  await SportPlayerModelDef.delete({ _id: existing._id });
  // Attendance rows stay: they are history.
  for (const lesson of rows(await SportLessonModelDef.get({ sportId }))) {
    if (!inLesson(lesson, studentId)) continue;
    await SportLessonModelDef.updateExisting(
      { _id: lesson._id },
      { players: (lesson.players || []).filter((p) => String(p.studentId) !== studentId), updatedAt: new Date() },
    );
  }
  await record(req, "delete", "player", null, studentId, existing);
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
  return res.status(200).json({ ok: true, value });
});

module.exports = {
  ensureFootball, getSport, setStats, listPlayers, searchStudents, savePlayer, deletePlayer, bumpStat,
};
