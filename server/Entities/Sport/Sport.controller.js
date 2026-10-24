const crypto = require("crypto");
const { SportModelDef } = require("./Sport.model");
const { SportTeamModelDef } = require("./SportTeam.model");
const { SportPlayerModelDef } = require("./SportPlayer.model");
const { SportTrainingModelDef } = require("./SportTraining.model");
const { StudentModelDef } = require("../Student/Student.model");
const { UserModelDef } = require("../User/User.model");
const { logWithSource } = require("../../middleware/logger");
const { audit } = require("../../utils/audit");
const { can, effectivePermissions, isSystemTz } = require("../../utils/permissions");

const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";
const NOT_FOUND = { sport: "الرياضة غير موجودة", team: "الفريق غير موجود", training: "التدريب غير موجود", student: "الطالب غير موجود" };
const FORBIDDEN = "لا توجد صلاحية";
const MAX_STATS = 4;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

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
const isManager = (req) => can(req.actor.permissions, "sports.manage");
const isCoachOf = (req, team) => (team?.coachIds || []).map(String).includes(String(req.actor.id));
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

/* ---------- sports ---------- */

// Returns { name, icon, stats } or { error }. Existing keys are kept only when
// the sport already has them; everything else gets a fresh key.
function parseSport(body, current) {
  const name = text(body?.name);
  const icon = text(body?.icon);
  if (!name) return { error: "اسم الرياضة مطلوب" };
  if ([...icon].length > 4) return { error: "الرمز طويل جدًا (حتى 4 رموز)" };
  const input = body?.stats ?? [];
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
  return { name, icon, stats };
}

const listSports = handle("listSports", async (req, res) => {
  const sports = rows(await SportModelDef.get({}));
  return res.status(200).json({ ok: true, sports });
});

const createSport = handle("createSport", async (req, res) => {
  const parsed = parseSport(req.body);
  if (parsed.error) return fail(res, 400, parsed.error);
  const now = new Date();
  const created = await SportModelDef.create({ ...parsed, createdAt: now, updatedAt: now });
  const sport = created?.result;
  await record(req, "create", "sport", sport, parsed.name);
  return res.status(201).json({ ok: true, sport });
});

const updateSport = handle("updateSport", async (req, res) => {
  const current = await findOne(SportModelDef, req.params.id);
  if (!current) return fail(res, 404, NOT_FOUND.sport);
  const parsed = parseSport(req.body, current);
  if (parsed.error) return fail(res, 400, parsed.error);
  const updated = await SportModelDef.updateExisting({ _id: current._id }, { ...parsed, updatedAt: new Date() });
  const sport = updated?.result;
  await record(req, "update", "sport", sport, parsed.name, current);
  return res.status(200).json({ ok: true, sport });
});

const deleteSport = handle("deleteSport", async (req, res) => {
  const current = await findOne(SportModelDef, req.params.id);
  if (!current) return fail(res, 404, NOT_FOUND.sport);
  const sportId = String(current._id);
  const [teams, players] = await Promise.all([
    SportTeamModelDef.get({ sportId }), SportPlayerModelDef.get({ sportId }),
  ]);
  if (rows(teams).length || rows(players).length) {
    return fail(res, 409, "لا يمكن حذف رياضة لها فرق أو لاعبون");
  }
  await SportModelDef.delete({ _id: current._id });
  await record(req, "delete", "sport", null, current.name, current);
  return res.status(200).json({ ok: true });
});

/* ---------- coaches and teams ---------- */

async function eligibleCoaches() {
  const users = rows(await UserModelDef.get({}, "active"));
  return users.filter((u) => {
    const set = effectivePermissions(u, { isSystem: isSystemTz(String(u.tz || "")) });
    return can(set, "sports.coach") || can(set, "sports.manage");
  });
}

const listCoaches = handle("listCoaches", async (req, res) => {
  const coaches = (await eligibleCoaches()).map((u) => ({ id: String(u._id), firstname: u.firstname, lastname: u.lastname }));
  return res.status(200).json({ ok: true, coaches });
});

const studentMap = async () => new Map(rows(await StudentModelDef.get({})).map((s) => [String(s._id), s]));

function presentTeam(team, students, coachUsers) {
  const coachNames = (team.coachIds || []).map((id) => fullName(coachUsers.get(String(id)))).filter(Boolean);
  const members = (team.members || []).map((m) => {
    const s = students.get(String(m.studentId));
    return { studentId: String(m.studentId), joinedAt: m.joinedAt, firstname: s?.firstname || "", lastname: s?.lastname || "" };
  });
  return { ...team, coachNames, members };
}

const listTeams = handle("listTeams", async (req, res) => {
  const [teams, students, users] = await Promise.all([
    SportTeamModelDef.get({}), studentMap(), UserModelDef.get({}, "active"),
  ]);
  const coachUsers = new Map(rows(users).map((u) => [String(u._id), u]));
  return res.status(200).json({ ok: true, teams: rows(teams).map((t) => presentTeam(t, students, coachUsers)) });
});

// Returns { name, sportId, coachIds } or { error, status }.
async function parseTeam(body) {
  const name = text(body?.name);
  if (!name) return { status: 400, error: "اسم الفريق مطلوب" };
  const sport = await findOne(SportModelDef, body?.sportId);
  if (!sport) return { status: 400, error: NOT_FOUND.sport };
  const coachIds = uniqueIds(body?.coachIds);
  const allowed = new Set((await eligibleCoaches()).map((u) => String(u._id)));
  if (coachIds.some((id) => !allowed.has(id))) return { status: 400, error: "المدرّب يجب أن يكون مستخدمًا فعّالًا لديه صلاحية التدريب" };
  return { name, sportId: String(sport._id), coachIds };
}

const createTeam = handle("createTeam", async (req, res) => {
  const parsed = await parseTeam(req.body);
  if (parsed.error) return fail(res, parsed.status, parsed.error);
  const now = new Date();
  const created = await SportTeamModelDef.create({ ...parsed, members: [], createdAt: now, updatedAt: now });
  await record(req, "create", "team", created?.result, parsed.name);
  return res.status(201).json({ ok: true, team: created?.result });
});

const updateTeam = handle("updateTeam", async (req, res) => {
  const current = await findOne(SportTeamModelDef, req.params.id);
  if (!current) return fail(res, 404, NOT_FOUND.team);
  const parsed = await parseTeam(req.body);
  if (parsed.error) return fail(res, parsed.status, parsed.error);
  if (parsed.sportId !== String(current.sportId) && (current.members || []).length) {
    return fail(res, 400, "لا يمكن تغيير رياضة فريق فيه أعضاء");
  }
  const updated = await SportTeamModelDef.updateExisting({ _id: current._id }, { ...parsed, updatedAt: new Date() });
  await record(req, "update", "team", updated?.result, parsed.name, current);
  return res.status(200).json({ ok: true, team: updated?.result });
});

const deleteTeam = handle("deleteTeam", async (req, res) => {
  const current = await findOne(SportTeamModelDef, req.params.id);
  if (!current) return fail(res, 404, NOT_FOUND.team);
  await SportTrainingModelDef.delete({ teamId: String(current._id) });
  await SportTeamModelDef.delete({ _id: current._id });
  await record(req, "delete", "team", null, current.name, current);
  return res.status(200).json({ ok: true });
});

const setMembers = handle("setMembers", async (req, res) => {
  const team = await findOne(SportTeamModelDef, req.params.id);
  if (!team) return fail(res, 404, NOT_FOUND.team);
  if (!isManager(req) && !isCoachOf(req, team)) return fail(res, 403, FORBIDDEN);
  if (!Array.isArray(req.body?.studentIds)) return fail(res, 400, "قائمة الأعضاء غير صحيحة");
  const studentIds = uniqueIds(req.body.studentIds);
  const players = new Set(rows(await SportPlayerModelDef.get({ sportId: String(team.sportId) })).map((p) => String(p.studentId)));
  if (studentIds.some((id) => !players.has(id))) return fail(res, 400, "كل عضو يجب أن يكون لاعبًا في رياضة الفريق");
  const joined = new Map((team.members || []).map((m) => [String(m.studentId), m.joinedAt]));
  const now = new Date();
  const members = studentIds.map((studentId) => ({ studentId, joinedAt: joined.get(studentId) || now }));
  const updated = await SportTeamModelDef.updateExisting({ _id: team._id }, { members, updatedAt: now });
  await record(req, "members", "team", updated?.result, team.name, team);
  return res.status(200).json({ ok: true, team: updated?.result });
});

/* ---------- players ---------- */

const listPlayers = handle("listPlayers", async (req, res) => {
  const [players, students] = await Promise.all([SportPlayerModelDef.get({}), studentMap()]);
  const out = [];
  for (const p of rows(players)) {
    const s = students.get(String(p.studentId));
    if (!s) continue;
    out.push({
      studentId: String(p.studentId), firstname: s.firstname, lastname: s.lastname, birth_date: s.birth_date,
      gender: s.gender, email: s.email, photo: s.photo,
      sportId: String(p.sportId), jerseyNumber: p.jerseyNumber ?? null, position: p.position || "",
    });
  }
  return res.status(200).json({ ok: true, players: out });
});

const searchStudents = handle("searchStudents", async (req, res) => {
  const q = text(req.query?.q);
  if ([...q].length < 2) return res.status(200).json({ ok: true, students: [] });
  const needle = q.toLowerCase();
  const students = rows(await StudentModelDef.get({}))
    .filter((s) => [s.firstname, s.lastname].some((v) => String(v || "").toLowerCase().includes(needle)))
    .slice(0, 20)
    .map((s) => ({
      _id: String(s._id), firstname: s.firstname, lastname: s.lastname,
      birth_date: s.birth_date, gender: s.gender, email: s.email,
    }));
  return res.status(200).json({ ok: true, students });
});

const setPlayer = handle("setPlayer", async (req, res) => {
  const { studentId, sportId } = req.params;
  const [student, sport] = await Promise.all([findOne(StudentModelDef, studentId), findOne(SportModelDef, sportId)]);
  if (!student) return fail(res, 404, NOT_FOUND.student);
  if (!sport) return fail(res, 404, NOT_FOUND.sport);
  const raw = req.body?.jerseyNumber;
  let jerseyNumber = null;
  if (raw !== null && raw !== undefined && raw !== "") {
    jerseyNumber = Number(raw);
    if (!Number.isInteger(jerseyNumber) || jerseyNumber < 1 || jerseyNumber > 99) return fail(res, 400, "رقم القميص يجب أن يكون عددًا من 1 إلى 99");
  }
  const position = text(req.body?.position);
  if ([...position].length > 30) return fail(res, 400, "المركز طويل جدًا (حتى 30 حرفًا)");
  const filter = { studentId: String(student._id), sportId: String(sport._id) };
  const existing = rows(await SportPlayerModelDef.get(filter))[0];
  const now = new Date();
  const saved = existing
    ? await SportPlayerModelDef.updateExisting({ _id: existing._id }, { jerseyNumber, position, updatedAt: now })
    : await SportPlayerModelDef.create({ ...filter, jerseyNumber, position, createdAt: now, updatedAt: now });
  await record(req, existing ? "update" : "create", "player", saved?.result, fullName(student), existing || null);
  return res.status(200).json({ ok: true, player: saved?.result });
});

const deletePlayer = handle("deletePlayer", async (req, res) => {
  const studentId = String(req.params.studentId);
  const sportId = String(req.params.sportId);
  const existing = rows(await SportPlayerModelDef.get({ studentId, sportId }))[0];
  if (!existing) return fail(res, 404, "اللاعب غير موجود");
  await SportPlayerModelDef.delete({ _id: existing._id });
  const teams = rows(await SportTeamModelDef.get({ sportId }));
  for (const team of teams) {
    if ((team.members || []).some((m) => String(m.studentId) === studentId)) {
      await SportTeamModelDef.updateExisting(
        { _id: team._id },
        { members: team.members.filter((m) => String(m.studentId) !== studentId), updatedAt: new Date() },
      );
    }
  }
  await record(req, "delete", "player", null, studentId, existing);
  return res.status(200).json({ ok: true });
});

/* ---------- trainings ---------- */

const listTrainings = handle("listTrainings", async (req, res) => {
  const team = await findOne(SportTeamModelDef, req.params.id);
  if (!team) return fail(res, 404, NOT_FOUND.team);
  const trainings = rows(await SportTrainingModelDef.get({ teamId: String(team._id) }))
    .sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt));
  return res.status(200).json({ ok: true, trainings });
});

function parseStart(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date : null;
}

const createTraining = handle("createTraining", async (req, res) => {
  const team = await findOne(SportTeamModelDef, req.params.id);
  if (!team) return fail(res, 404, NOT_FOUND.team);
  if (!isManager(req) && !isCoachOf(req, team)) return fail(res, 403, FORBIDDEN);
  const startsAt = parseStart(req.body?.startsAt);
  if (!startsAt) return fail(res, 400, "موعد التدريب غير صحيح");
  const place = text(req.body?.place);
  const now = new Date();
  const created = await SportTrainingModelDef.create({
    teamId: String(team._id), sportId: String(team.sportId), startsAt, place,
    presentIds: [], recorded: false, createdAt: now, updatedAt: now,
  });
  await record(req, "create", "training", created?.result, team.name);
  return res.status(201).json({ ok: true, training: created?.result });
});

// Loads the training and its team and checks the actor may change them.
async function trainingAccess(req, res) {
  const training = await findOne(SportTrainingModelDef, req.params.id);
  if (!training) { fail(res, 404, NOT_FOUND.training); return null; }
  const team = await findOne(SportTeamModelDef, training.teamId);
  if (!isManager(req) && !isCoachOf(req, team)) { fail(res, 403, FORBIDDEN); return null; }
  return { training, team };
}

const updateTraining = handle("updateTraining", async (req, res) => {
  const access = await trainingAccess(req, res);
  if (!access) return null;
  const { training, team } = access;
  const patch = { updatedAt: new Date() };
  if (req.body?.startsAt !== undefined) {
    const startsAt = parseStart(req.body.startsAt);
    if (!startsAt) return fail(res, 400, "موعد التدريب غير صحيح");
    patch.startsAt = startsAt;
  }
  if (req.body?.place !== undefined) patch.place = text(req.body.place);
  if (req.body?.presentIds !== undefined) {
    if (!Array.isArray(req.body.presentIds)) return fail(res, 400, "قائمة الحضور غير صحيحة");
    const presentIds = uniqueIds(req.body.presentIds);
    const members = new Set((team?.members || []).map((m) => String(m.studentId)));
    if (presentIds.some((id) => !members.has(id))) return fail(res, 400, "الحضور يقتصر على أعضاء الفريق");
    patch.presentIds = presentIds;
    patch.recorded = true;
  }
  const updated = await SportTrainingModelDef.updateExisting({ _id: training._id }, patch);
  await record(req, patch.recorded ? "attendance" : "update", "training", updated?.result, team?.name || "", training);
  return res.status(200).json({ ok: true, training: updated?.result });
});

const deleteTraining = handle("deleteTraining", async (req, res) => {
  const access = await trainingAccess(req, res);
  if (!access) return null;
  await SportTrainingModelDef.delete({ _id: access.training._id });
  await record(req, "delete", "training", null, access.team?.name || "", access.training);
  return res.status(200).json({ ok: true });
});

module.exports = {
  listSports, createSport, updateSport, deleteSport,
  listCoaches, listTeams, createTeam, updateTeam, deleteTeam, setMembers,
  listPlayers, searchStudents, setPlayer, deletePlayer,
  listTrainings, createTraining, updateTraining, deleteTraining,
};
