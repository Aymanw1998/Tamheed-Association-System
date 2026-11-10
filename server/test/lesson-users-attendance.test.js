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
      else rows.push({ ...filter, ...patch });
      return { success: true, result: row || { ...filter, ...patch } };
    },
  });
}

function world({ attendance = [], extraStudents = [] } = {}) {
  const lessons = memoryModel([{
    _id: LESSON_ID, name: "برنامج", teacher: GUIDE._id, helper: null, room: "1",
    date: { day: 4, startMin: 900, endMin: 960 },
    list_students: [STUDENT._id], list_users: [STAFF1._id, FORMER._id],
  }]);
  const users = memoryModel({ active: [ADMIN, GUIDE, STAFF1, STAFF2], noActive: [FORMER] });
  const students = memoryModel([STUDENT, ...extraStudents]);
  const rows = attendanceStore(attendance);
  const controller = load("Attendance/Attendance.controller.js", {
    "./Attendance.model": { AttendanceModelDef: rows },
    "../Lesson/Lesson.model": { LessonModelDef: lessons },
    "../User/User.model": { UserModelDef: users },
    "../Student/Student.model": { StudentModelDef: students },
    "../../utils/permissions": require("../utils/permissions"),
    "../../utils/studentScope": require("../utils/studentScope"),
    "../../utils/attendanceMarks": require("../utils/attendanceMarks"),
    "../../middleware/logger": { logWithSource() {} },
    ...auditStub().deps,
  });
  return { controller, rows: rows.rows };
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

test("GET /export is guarded by attendance.view", () => {
  const route = fs.readFileSync(path.join(__dirname, "../Entities/Attendance/Attendance.route.js"), "utf8");
  assert.ok(route.includes('router.get("/export", requirePermission("attendance.view"), exportAttendance);'));
});
