const assert = require("node:assert/strict");
const live = require("./helpers/liveStubs");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { actorFor } = require("./helpers/actors");
const { auditStub } = require("./helpers/auditStub");
const { memoryModel, matches } = require("./helpers/memoryModel");

// Attendance for users taking part in a lesson (owner, 2026-11-09): rows
// carry `user` instead of `student`, on the same sheet. Synthetic data only.

function load(file, dependencies) {
  const filename = path.join(__dirname, "../Entities", file);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, Date, console: { log() {}, warn() {}, error() {} },
    require(name) {
      if (!Object.hasOwn(dependencies, name) && Object.hasOwn(live.deps, name)) return live.deps[name];
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return module.exports;
}

const id = (c) => c.repeat(24);
const ADMIN = { _id: id("a"), tz: "900000001", firstname: "مدير", lastname: "أ", role: "ادارة" };
const GUIDE = { _id: id("b"), tz: "900000002", firstname: "مرشد", lastname: "ب", role: "مرشد" };
const STAFF1 = { _id: id("d"), tz: "900000004", firstname: "موظف", lastname: "د", role: "مساعد" };
const STAFF2 = { _id: id("f"), tz: "900000006", firstname: "موظفة", lastname: "و", role: "مرشد" };
const FORMER = { _id: id("9"), tz: "900000009", firstname: "سابق", lastname: "", role: "مساعد" };
const STUDENT = { _id: id("5"), tz: "800000001", firstname: "طالب", lastname: "هـ", main_teacher: GUIDE._id };
const LESSON_ID = id("1");
const DATE = { year: 2026, month: 11, day: 11 };
const DATE_KEY = 20261111;

function attendanceStore(rows = []) {
  const store = memoryModel(rows);
  return Object.assign(store, {
    rows,
    async create(doc) { rows.push({ ...doc }); return { success: true, result: doc }; },
    // Like api.update: an upsert on the filter.
    async update(filter, patch) {
      const row = rows.find((r) => matches(r, filter));
      if (row) Object.assign(row, patch);
      else rows.push({ _id: `row-${rows.length}-${Math.random().toString(16).slice(2)}`, ...filter, ...patch });
      return { success: true, result: row || { ...filter, ...patch } };
    },
    async updateExisting(filter, patch) {
      const row = rows.find((r) => matches(r, filter));
      if (!row) return { success: true, result: null };
      Object.assign(row, patch);
      return { success: true, result: { ...row } };
    },
    async delete(filter) {
      const before = rows.length;
      for (let i = rows.length - 1; i >= 0; i -= 1) if (matches(rows[i], filter)) rows.splice(i, 1);
      return { success: true, result: { deletedCount: before - rows.length } };
    },
  });
}

function world({ attendance = [], extraStudents = [], extraUsers = [], lessonPatch = {}, failStudents = false } = {}) {
  const lessons = memoryModel([{
    _id: LESSON_ID, name: "برنامج", teacher: GUIDE._id, helper: null, room: "1",
    date: { day: 4, startMin: 900, endMin: 960 },
    list_students: [STUDENT._id], list_users: [STAFF1._id, FORMER._id], ...lessonPatch,
  }]);
  const users = memoryModel({ active: [ADMIN, GUIDE, STAFF1, STAFF2, ...extraUsers], noActive: [FORMER] });
  const students = memoryModel([STUDENT, ...extraStudents]);
  if (failStudents) students.get = async () => { throw new Error("db down"); };
  const rows = attendanceStore(attendance);
  const audit = auditStub();
  const controller = load("Attendance/Attendance.controller.js", {
    "./Attendance.model": { AttendanceModelDef: rows },
    "../Lesson/Lesson.model": { LessonModelDef: lessons },
    "../User/User.model": { UserModelDef: users },
    "../Student/Student.model": { StudentModelDef: students },
    "../../utils/permissions": require("../utils/permissions"),
    "../../utils/studentScope": require("../utils/studentScope"),
    "../../utils/attendanceMarks": require("../utils/attendanceMarks"),
    "../../middleware/logger": { logWithSource(w, e) { if (process.env.DEBUG_ATT) console.error(w, e); } },
    ...audit.deps,
  });
  return { controller, rows: rows.rows, store: rows, audit, auditStub: audit };
}

async function call(handler, user, req = {}) {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = JSON.parse(JSON.stringify(v)); return this; } };
  await handler({ actor: actorFor(user), user: { id: user._id }, params: {}, query: {}, body: {}, headers: {}, ...req }, res);
  return res;
}

test("the sheet lists the students, then the active participating users", async () => {
  const w = world();
  const res = await call(w.controller.getSheet, ADMIN, { query: { lessonId: LESSON_ID, ...DATE } });
  assert.equal(res.statusCode, 200);
  const items = res.body.schema.items;
  assert.deepEqual(items.map((it) => it.studentId || `u:${it.userId}`), [STUDENT._id, `u:${STAFF1._id}`]);
  assert.equal(items[1].kind, "user");
  assert.equal(items[1].studentName, "موظف د");
  assert.ok(w.rows.some((r) => r.user === STAFF1._id && r.dateKey === DATE_KEY && !r.student));
  assert.ok(!w.rows.some((r) => r.user === FORMER._id));
});

test("saving writes a participant's row and ignores a user who is not on the lesson", async () => {
  const w = world();
  const res = await call(w.controller.bulkSave, ADMIN, { body: { lessonId: LESSON_ID, ...DATE, items: [
    { studentId: STUDENT._id, status: "حاضر", notes: "" },
    { userId: STAFF1._id, status: "غائب", notes: "مرض" },
    { userId: STAFF2._id, status: "غائب", notes: "" },
  ] } });
  assert.equal(res.statusCode, 200);
  const staffRow = w.rows.find((r) => r.user === STAFF1._id);
  assert.equal(staffRow.status, "غائب");
  assert.equal(staffRow.notes, "مرض");
  assert.ok(!w.rows.some((r) => r.user === STAFF2._id));
  assert.ok(!w.rows.some((r) => r.student === "undefined" || (r.user && r.student)));
});

test("the lesson's guide saves the participants' rows on his own lesson", async () => {
  const w = world();
  const res = await call(w.controller.bulkSave, GUIDE, { body: { lessonId: LESSON_ID, ...DATE, items: [
    { userId: STAFF1._id, status: "متأخر", notes: "" },
  ] } });
  assert.equal(res.statusCode, 200);
  assert.equal(w.rows.find((r) => r.user === STAFF1._id)?.status, "متأخر");
});

test("the nightly job marks an unrecorded participant absent, like a student", async () => {
  const w = world();
  const out = await w.controller.runDailyAbsenceJob({ ...DATE, dow1to7: 4 });
  assert.equal(out.ok, true);
  const staffRow = w.rows.find((r) => r.user === STAFF1._id);
  assert.equal(staffRow?.status, "غائب");
  assert.equal(staffRow?.auto, true);
  assert.ok(!w.rows.some((r) => r.user === FORMER._id));
  assert.ok(w.rows.some((r) => r.student === STUDENT._id));
});

test("a participant already recorded is not marked absent again", async () => {
  const w = world({ attendance: [{ lesson: LESSON_ID, user: STAFF1._id, dateKey: DATE_KEY, status: "حاضر", notes: "" }] });
  await w.controller.runDailyAbsenceJob({ ...DATE, dow1to7: 4 });
  assert.equal(w.rows.filter((r) => r.user === STAFF1._id).length, 1);
  assert.equal(w.rows.find((r) => r.user === STAFF1._id).status, "حاضر");
});

test("being a participant does not open the lesson's attendance sheet", async () => {
  const w = world();
  const res = await call(w.controller.getSheet, STAFF1, { query: { lessonId: LESSON_ID, ...DATE } });
  assert.equal(res.statusCode, 404);
  const save = await call(w.controller.bulkSave, STAFF1, { body: { lessonId: LESSON_ID, ...DATE, items: [{ userId: STAFF1._id, status: "حاضر" }] } });
  assert.equal(save.statusCode, 404);
  assert.equal(w.rows.length, 0);
});

/* ================= Excel export (owner, 2026-11-10) ================= */
// A student who left the lesson; his guide is someone else.
const OLD = { _id: id("7"), tz: "800000002", firstname: "قديم", lastname: "ز", main_teacher: ADMIN._id };
const exportWorld = () => world({
  extraStudents: [OLD],
  attendance: [
    { lesson: LESSON_ID, student: STUDENT._id, dateKey: 20261104, status: "حاضر", notes: "" },
    { lesson: LESSON_ID, student: STUDENT._id, dateKey: 20261111, status: "غائب", notes: "مرض", auto: false },
    { lesson: LESSON_ID, user: STAFF1._id, dateKey: 20261111, status: "متأخر", notes: "" },
    { lesson: LESSON_ID, student: OLD._id, dateKey: 20261028, status: "حاضر", notes: "" },
    { lesson: LESSON_ID, student: STUDENT._id, dateKey: 20261201, status: "حاضر", notes: "" },
    { lesson: id("2"), student: STUDENT._id, dateKey: 20261111, status: "غائب", notes: "" },
  ],
});
const range = { lessonId: LESSON_ID, from: "2026-10-01", to: "2026-11-30" };

test("export lists one lesson's marks in the range, students and staff, oldest first", async () => {
  const w = exportWorld();
  const res = await call(w.controller.exportAttendance, ADMIN, { query: range });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.lesson.name, "برنامج");
  assert.deepEqual(res.body.rows.map((r) => [r.dateKey, r.name, r.kind, r.status]), [
    [20261028, "قديم ز", "student", "حاضر"],
    [20261104, "طالب هـ", "student", "حاضر"],
    [20261111, "طالب هـ", "student", "غائب"],
    [20261111, "موظف د", "user", "متأخر"],
  ]);
  assert.equal(res.body.rows[2].notes, "مرض");
  assert.ok(!JSON.stringify(res.body).includes("800000001"), "ID numbers never go out");
});

test("a guide exports only the students he may see", async () => {
  const w = exportWorld();
  const res = await call(w.controller.exportAttendance, GUIDE, { query: range });
  assert.equal(res.statusCode, 200);
  assert.ok(!res.body.rows.some((r) => r.name === "قديم ز"));
  assert.ok(res.body.rows.some((r) => r.name === "طالب هـ"));
});

test("export refuses a lesson the actor cannot open, and bad ranges", async () => {
  const w = exportWorld();
  assert.equal((await call(w.controller.exportAttendance, STAFF1, { query: range })).statusCode, 404);
  for (const bad of [{ from: "2026-11-30", to: "2026-10-01" }, { from: "2026-13-01", to: "2026-11-30" }, { from: "2025-01-01", to: "2026-11-30" }, { from: "", to: "" }]) {
    const res = await call(w.controller.exportAttendance, ADMIN, { query: { lessonId: LESSON_ID, ...bad } });
    assert.equal(res.statusCode, 400, JSON.stringify(bad));
  }
});

test("GET /export is guarded by attendance.view and its own attendance.exportExcel", () => {
  const route = fs.readFileSync(path.join(__dirname, "../Entities/Attendance/Attendance.route.js"), "utf8");
  assert.ok(route.includes('router.get("/export", requirePermission("attendance.view"), requirePermission("attendance.exportExcel"), exportAttendance);'));
});

// Codex full review, 2026-11-18: every export leaves a row in the audit log,
// and with no row there is no file.
test("an export is recorded in the audit log; when it cannot be, nothing goes out", async () => {
  const w = exportWorld();
  const res = await call(w.controller.exportAttendance, ADMIN, { query: range });
  assert.equal(res.statusCode, 200);
  const [row] = w.audit.find({ module: "attendance", action: "export_excel" });
  assert.ok(row, "recorded");
  assert.equal(row.targetId, LESSON_ID);

  const failing = exportWorld();
  failing.auditStub.deps["../../utils/audit"].audit.recordRequired = async () => false;
  const refused = await call(failing.controller.exportAttendance, ADMIN, { query: range });
  assert.equal(refused.statusCode, 503);
  assert.equal(refused.body.code, "AUDIT_FAILED");
  assert.equal(refused.body.rows, undefined);
});

/* ---------- a student who became staff (owner, 2026-11-19; Codex build review) ---------- */

const CONVERTED = { _id: id("6"), tz: "800000006", firstname: "صار", lastname: "طاقم", archivedAt: new Date("2026-11-14T10:00:00Z"),
  staffConversion: { phase: "done", userId: id("7"), cutoverDateKey: 20261115, plannedLessons: [LESSON_ID] } };
const NEW_STAFF = { _id: id("7"), tz: "800000006", firstname: "صار", lastname: "طاقم", role: "مساعد", fromStudentId: id("6") };
const convertedWorld = (attendance = []) => world({ attendance, extraStudents: [CONVERTED], extraUsers: [NEW_STAFF], lessonPatch: { list_users: [NEW_STAFF._id] } });

test("before the cutover the sheet shows his student row, not the staff row", async () => {
  const w = convertedWorld([{ lesson: LESSON_ID, student: CONVERTED._id, dateKey: DATE_KEY, year: 2026, month: 11, day: 11, status: "غائب", auto: false }]);
  const res = await call(w.controller.getSheet, ADMIN, { query: { lessonId: LESSON_ID, ...DATE } });
  const keys = res.body.schema.items.map((it) => it.studentId || `u:${it.userId}`);
  assert.ok(keys.includes(CONVERTED._id));
  assert.ok(!keys.includes(`u:${NEW_STAFF._id}`));
  assert.ok(!w.rows.some((r) => r.user === NEW_STAFF._id), "no staff row before the cutover");
});

test("a stale screen cannot save his student row after the cutover", async () => {
  const w = convertedWorld();
  const res = await call(w.controller.bulkSave, ADMIN, { body: { lessonId: LESSON_ID, year: 2026, month: 11, day: 18, items: [{ studentId: CONVERTED._id, status: "حاضر", notes: "" }] } });
  assert.equal(res.statusCode, 200);
  assert.ok(!w.rows.some((r) => r.student === CONVERTED._id));
});

test("his rows in the program he was moved out of stay in a scoped export", async () => {
  const w = convertedWorld([{ lesson: LESSON_ID, student: CONVERTED._id, dateKey: DATE_KEY, year: 2026, month: 11, day: 11, status: "غائب", auto: false }]);
  const res = await call(w.controller.exportAttendance, GUIDE, { query: { lessonId: LESSON_ID, from: "2026-11-01", to: "2026-11-30" } });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.rows.some((r) => r.name === "صار طاقم" && r.kind === "student"));
});

test("the nightly job skips a program when the conversion read fails, and marks no one", async () => {
  const w = world({ extraUsers: [NEW_STAFF], lessonPatch: { list_users: [NEW_STAFF._id] }, failStudents: true });
  await w.controller.runDailyAbsenceJob({ year: 2026, month: 11, day: 11, dow1to7: 4 });
  assert.equal(w.rows.length, 0);
});

/* ---------- Codex build review 2 ---------- */

test("a save whose student started becoming staff while it was on its way ends as his staff row", async () => {
  const racer = { _id: id("8"), tz: "800000008", firstname: "سباق", lastname: "" };
  const w = world({ extraStudents: [racer], extraUsers: [NEW_STAFF], lessonPatch: { list_students: [STUDENT._id, racer._id] } });
  const upsert = w.store.update.bind(w.store);
  w.store.update = async (filter, patch) => {
    const out = await upsert(filter, patch);
    // The conversion's barrier and row settling land right after this write.
    racer.staffConversion = { phase: "prepared", userId: NEW_STAFF._id, cutoverDateKey: DATE_KEY, plannedLessons: [LESSON_ID] };
    return out;
  };
  const res = await call(w.controller.bulkSave, ADMIN, { body: { lessonId: LESSON_ID, ...DATE, items: [{ studentId: racer._id, status: "متأخر", notes: "" }] } });
  assert.equal(res.statusCode, 200);
  assert.ok(!w.rows.some((r) => r.student === racer._id), "no student row from the cutover");
  const staffRow = w.rows.find((r) => r.user === NEW_STAFF._id && r.dateKey === DATE_KEY);
  assert.equal(staffRow?.status, "متأخر", "the saved mark is kept as his staff row");
});

test("a history row shown on the sheet is saved even after his staff account left the program", async () => {
  const w = world({
    attendance: [{ lesson: LESSON_ID, student: CONVERTED._id, dateKey: DATE_KEY, year: 2026, month: 11, day: 11, status: "غائب", auto: false }],
    extraStudents: [CONVERTED], extraUsers: [NEW_STAFF], lessonPatch: { list_users: [] },
  });
  const sheet = await call(w.controller.getSheet, GUIDE, { query: { lessonId: LESSON_ID, ...DATE } });
  assert.ok(sheet.body.schema.items.some((it) => it.studentId === CONVERTED._id), "shown");
  const res = await call(w.controller.bulkSave, GUIDE, { body: { lessonId: LESSON_ID, ...DATE, items: [{ studentId: CONVERTED._id, status: "حاضر", notes: "" }] } });
  assert.equal(res.statusCode, 200);
  assert.equal(w.rows.find((r) => r.student === CONVERTED._id).status, "حاضر", "saved, not dropped");
});

test("a scoped export keeps his rows before the cutover in a program he left before the conversion", async () => {
  const left = { ...CONVERTED, _id: id("4"), staffConversion: { ...CONVERTED.staffConversion, plannedLessons: [] } };
  const w = world({
    attendance: [
      { lesson: LESSON_ID, student: left._id, dateKey: DATE_KEY, year: 2026, month: 11, day: 11, status: "غائب", auto: false },
      { lesson: LESSON_ID, student: left._id, dateKey: 20261118, year: 2026, month: 11, day: 18, status: "غائب", auto: false },
    ],
    extraStudents: [left],
  });
  const res = await call(w.controller.exportAttendance, GUIDE, { query: { lessonId: LESSON_ID, from: "2026-11-01", to: "2026-11-30" } });
  assert.equal(res.statusCode, 200);
  const his = res.body.rows.filter((r) => r.name === "صار طاقم");
  assert.deepEqual(his.map((r) => r.dateKey), [DATE_KEY], "before the cutover only");
});

/* ---------- Codex build review 3 ---------- */

test("a raced save before his account exists keeps the student row (the conversion settles it later)", async () => {
  const racer = { _id: id("8"), tz: "800000008", firstname: "سباق", lastname: "" };
  const w = world({ extraStudents: [racer], lessonPatch: { list_students: [STUDENT._id, racer._id] } });
  const upsert = w.store.update.bind(w.store);
  w.store.update = async (filter, patch) => {
    const out = await upsert(filter, patch);
    racer.staffConversion = { phase: "prepared", userId: id("e"), cutoverDateKey: DATE_KEY, plannedLessons: [LESSON_ID] };
    return out;
  };
  const res = await call(w.controller.bulkSave, ADMIN, { body: { lessonId: LESSON_ID, ...DATE, items: [{ studentId: racer._id, status: "متأخر", notes: "" }] } });
  assert.equal(res.statusCode, 200);
  assert.ok(w.rows.some((r) => r.student === racer._id), "kept for the conversion");
  assert.ok(!w.rows.some((r) => r.user === id("e")), "nothing points at an account that does not exist");
});

test("a later save settles a forbidden row an earlier save left behind", async () => {
  const w = world({
    attendance: [{ _id: "left", lesson: LESSON_ID, student: CONVERTED._id, dateKey: 20261118, year: 2026, month: 11, day: 18, status: "متأخر", auto: false, updatedBy: ADMIN._id }],
    extraStudents: [CONVERTED], extraUsers: [NEW_STAFF], lessonPatch: { list_users: [NEW_STAFF._id] },
  });
  const res = await call(w.controller.bulkSave, ADMIN, { body: { lessonId: LESSON_ID, year: 2026, month: 11, day: 18, items: [{ studentId: CONVERTED._id, status: "حاضر", notes: "" }] } });
  assert.equal(res.statusCode, 200);
  assert.ok(!w.rows.some((r) => r.student === CONVERTED._id), "no student row from the cutover");
  assert.equal(w.rows.find((r) => r.user === NEW_STAFF._id)?.status, "متأخر", "the person's mark became his staff row");
});

test("a person's mark in a program outside his plan is kept, as his staff row", async () => {
  const outside = { ...CONVERTED, _id: id("4"), staffConversion: { ...CONVERTED.staffConversion, plannedLessons: [] } };
  const w = world({
    attendance: [{ _id: "kept", lesson: LESSON_ID, student: outside._id, dateKey: 20261118, year: 2026, month: 11, day: 18, status: "متأخر", auto: false, updatedBy: ADMIN._id }],
    extraStudents: [outside],
  });
  const res = await call(w.controller.bulkSave, ADMIN, { body: { lessonId: LESSON_ID, year: 2026, month: 11, day: 18, items: [{ studentId: outside._id, status: "حاضر", notes: "" }] } });
  assert.equal(res.statusCode, 200);
  const kept = w.rows.find((r) => r._id === "kept");
  assert.equal(kept?.status, "متأخر", "kept, not deleted and not overwritten");
  assert.equal(kept.student, null, "not a student row beside a staff row (Codex build review 4)");
  assert.equal(kept.user, outside.staffConversion.userId);
});

test("a deleted program opens no history save for a scoped guide", async () => {
  const w = world({
    attendance: [{ lesson: id("3"), student: CONVERTED._id, dateKey: DATE_KEY, year: 2026, month: 11, day: 11, status: "غائب", auto: false }],
    extraStudents: [CONVERTED],
  });
  await call(w.controller.bulkSave, GUIDE, { body: { lessonId: id("3"), ...DATE, items: [{ studentId: CONVERTED._id, status: "حاضر", notes: "" }] } });
  assert.equal(w.rows.find((r) => r.student === CONVERTED._id).status, "غائب");
});

/* ---------- Codex build review 4 ---------- */

test("a retry refused as stale still settles a row an earlier save left behind", async () => {
  const w = world({
    attendance: [{ _id: "left", lesson: LESSON_ID, student: CONVERTED._id, dateKey: 20261118, year: 2026, month: 11, day: 18, status: "متأخر", auto: false, updatedBy: ADMIN._id, updatedAt: new Date("2026-11-18T09:00:00Z") }],
    extraStudents: [CONVERTED], extraUsers: [NEW_STAFF], lessonPatch: { list_users: [NEW_STAFF._id] },
  });
  const res = await call(w.controller.bulkSave, ADMIN, {
    body: { lessonId: LESSON_ID, year: 2026, month: 11, day: 18, baseVersion: "2026-11-01T00:00:00.000Z", items: [{ studentId: CONVERTED._id, status: "حاضر", notes: "" }] },
  });
  assert.equal(res.statusCode, 409);
  assert.ok(!w.rows.some((r) => r.student === CONVERTED._id), "settled although the save was refused");
  assert.equal(w.rows.find((r) => r._id === "left").user, NEW_STAFF._id);
});

/* ---------- testing review, 2026-11-20 ---------- */

test("the nightly job follows the cutover: a student absence before it, a staff absence from it", async () => {
  const before = world({ extraStudents: [CONVERTED], extraUsers: [NEW_STAFF], lessonPatch: { list_users: [NEW_STAFF._id] } });
  await before.controller.runDailyAbsenceJob({ year: 2026, month: 11, day: 11, dow1to7: 4 });
  assert.ok(before.rows.some((r) => r.student === CONVERTED._id && r.status === "غائب"), "his student absence before the cutover");
  assert.ok(!before.rows.some((r) => r.user === NEW_STAFF._id), "no staff absence before the cutover");

  const after = world({ extraStudents: [CONVERTED], extraUsers: [NEW_STAFF], lessonPatch: { list_users: [NEW_STAFF._id] } });
  await after.controller.runDailyAbsenceJob({ year: 2026, month: 11, day: 18, dow1to7: 4 });
  assert.ok(after.rows.some((r) => r.user === NEW_STAFF._id && r.status === "غائب"), "his staff absence from the cutover");
  assert.ok(!after.rows.some((r) => r.student === CONVERTED._id), "no student absence from the cutover");
});

test("a sheet whose roster was read before a conversion finished leaves no student row from the cutover", async () => {
  const racer = { _id: id("8"), tz: "800000008", firstname: "سباق", lastname: "" };
  const w = world({ extraStudents: [racer], lessonPatch: { list_students: [STUDENT._id, racer._id] } });
  const create = w.store.create.bind(w.store);
  w.store.create = async (doc) => {
    const out = await create({ _id: `new-${w.rows.length}`, ...doc });
    if (doc.student === racer._id) racer.staffConversion = { phase: "done", userId: NEW_STAFF._id, cutoverDateKey: DATE_KEY, plannedLessons: [LESSON_ID] };
    return out;
  };
  const res = await call(w.controller.getSheet, ADMIN, { query: { lessonId: LESSON_ID, ...DATE } });
  assert.equal(res.statusCode, 200);
  assert.ok(!w.rows.some((r) => r.student === racer._id), "the empty student row is removed");
  assert.ok(w.rows.some((r) => r.student === STUDENT._id), "the others stay");
});

test("a staff row added by a sheet while his student row is re-keyed ends as one row", async () => {
  const w = world({
    attendance: [{ _id: "saved", lesson: LESSON_ID, student: CONVERTED._id, dateKey: 20261118, year: 2026, month: 11, day: 18, status: "متأخر", auto: false, updatedBy: ADMIN._id }],
    extraStudents: [CONVERTED], extraUsers: [NEW_STAFF], lessonPatch: { list_users: [NEW_STAFF._id] },
  });
  // A sheet adds his empty staff row between the re-key's check and its write.
  const updateExisting = w.store.updateExisting.bind(w.store);
  w.store.updateExisting = async (filter, patch) => {
    if (patch.user === NEW_STAFF._id) w.rows.push({ _id: "sheet", lesson: LESSON_ID, user: NEW_STAFF._id, dateKey: 20261118, status: "حاضر", notes: "" });
    return updateExisting(filter, patch);
  };
  await call(w.controller.bulkSave, ADMIN, { body: { lessonId: LESSON_ID, year: 2026, month: 11, day: 18, items: [] } });
  const res = await call(w.controller.bulkSave, ADMIN, { body: { lessonId: LESSON_ID, year: 2026, month: 11, day: 18, items: [{ studentId: CONVERTED._id, status: "حاضر", notes: "" }] } });
  assert.equal(res.statusCode, 200);
  const his = w.rows.filter((r) => r.user === NEW_STAFF._id && r.dateKey === 20261118);
  assert.equal(his.length, 1);
  assert.equal(his[0].status, "متأخر", "the person's mark is the one kept");
});
