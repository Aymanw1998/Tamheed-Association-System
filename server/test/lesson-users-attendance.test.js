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

function world({ attendance = [] } = {}) {
  const lessons = memoryModel([{
    _id: LESSON_ID, name: "برنامج", teacher: GUIDE._id, helper: null, room: "1",
    date: { day: 4, startMin: 900, endMin: 960 },
    list_students: [STUDENT._id], list_users: [STAFF1._id, FORMER._id],
  }]);
  const users = memoryModel({ active: [ADMIN, GUIDE, STAFF1, STAFF2], noActive: [FORMER] });
  const students = memoryModel([STUDENT]);
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
