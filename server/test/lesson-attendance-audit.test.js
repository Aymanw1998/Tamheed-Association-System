const assert = require("node:assert/strict");
const live = require("./helpers/liveStubs");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { actorFor } = require("./helpers/actors");
const { auditStub } = require("./helpers/auditStub");

// In-memory stand-in for the generic model CRUD (upserting update, like api.js).
function createStore(seed = []) {
  let docs = seed.map((doc, i) => ({ _id: doc._id || `doc-${i}`, ...doc }));
  let next = docs.length;
  const get = (obj, key) => key.split(".").reduce((v, k) => v?.[k], obj);
  const matches = (doc, filter = {}) => Object.keys(filter).every((k) => String(get(doc, k)) === String(filter[k]));
  return {
    async get(filter = {}) { return { success: true, result: docs.filter((d) => matches(d, filter)).map((d) => structuredClone(d)) }; },
    async create(data) {
      const doc = { _id: `doc-${next++}`, ...structuredClone(data) };
      docs.push(doc);
      return { success: true, result: structuredClone(doc) };
    },
    async update(filter, patch) {
      let hit = false;
      docs = docs.map((d) => (matches(d, filter) ? ((hit = true), { ...d, ...structuredClone(patch) }) : d));
      if (!hit) docs.push({ _id: `doc-${next++}`, ...structuredClone(filter), ...structuredClone(patch) });
      return { success: true, result: null };
    },
    async delete(filter) { docs = docs.filter((d) => !matches(d, filter)); return { success: true }; },
    all: () => docs,
  };
}

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

const ADMIN = { _id: "a".repeat(24), tz: "111111118", firstname: "Ad", lastname: "Min", roles: ["ادارة"] };
const req = (extra = {}) => ({ user: { id: ADMIN._id, tz: ADMIN.tz, roles: ADMIN.roles }, actor: actorFor(ADMIN), params: {}, query: {}, body: {}, ...extra });
const createRes = () => ({ statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });

function lessonSetup(seed = [], users = []) {
  const lessons = createStore(seed);
  const audit = auditStub();
  const controller = load("Lesson/Lesson.controller.js", {
    "./Lesson.model": { LessonModelDef: lessons },
    "../Sport/SportLesson.model": { SportLessonModelDef: { async get() { return { success: true, result: [] }; } } },
    "../../utils/lessonConflict": require("../utils/lessonConflict"),
    "../User/User.model": { UserModelDef: createStore(users) },
    "../../utils/permissions": require("../utils/permissions"),
    "../../middleware/logger": { logWithSource() {} },
    "../Notification/Notification.controller": {},
    "../Student/Student.model": { StudentModelDef: createStore() },
    "../../utils/studentScope": require("../utils/studentScope"),
    "../../utils/attendanceMarks": require("../utils/attendanceMarks"),
    ...audit.deps,
  });
  return { controller, lessons, audit };
}

test("lesson create, edit, roster changes and delete are recorded in the audit log", async () => {
  const { controller, lessons, audit } = lessonSetup();
  const created = createRes();
  await controller.postOne(req({ body: { name: "Math", teacher: "t1", room: "1", date: { day: 2, startMin: 600, endMin: 645 } } }), created);
  assert.equal(created.statusCode, 201);
  const id = lessons.all()[0]._id;
  const [made] = audit.find({ module: "lessons", action: "create", targetId: id });
  assert.ok(made, "create recorded");
  assert.equal(made.targetType, "lesson");
  assert.match(made.targetLabel, /^Math/);

  await controller.putOne(req({ params: { id }, body: { name: "Algebra" } }), createRes());
  const [edited] = audit.find({ module: "lessons", action: "update", targetId: id });
  assert.equal(edited.before.name, "Math");
  assert.equal(edited.after.name, "Algebra");

  await controller.addToList(req({ params: { id }, body: { list_students: ["s1"] } }), createRes());
  const roster = audit.find({ module: "lessons", action: "update", targetId: id }).at(-1);
  assert.deepEqual(roster.after.list_students, ["s1"]);

  const removed = createRes();
  await controller.deleteOne(req({ params: { id } }), removed);
  assert.equal(removed.statusCode, 200);
  const [deleted] = audit.find({ module: "lessons", action: "delete", targetId: id });
  assert.equal(deleted.before.name, "Algebra");
  assert.equal(deleted.after, null);

  // Deleting a lesson that does not exist still answers 200 but records nothing.
  const count = audit.calls.length;
  const again = createRes();
  await controller.deleteOne(req({ params: { id } }), again);
  assert.equal(again.statusCode, 200);
  assert.equal(audit.calls.length, count);
});

test("attendance bulk-save writes one audit row per save with lesson, date and rows changed", async () => {
  const lessons = createStore([{ _id: "lesson-1", name: "Math", date: { day: 2, startMin: 600, endMin: 645 } }]);
  const attendance = createStore([
    { lesson: "lesson-1", student: "s1", dateKey: 20261017, status: "حاضر", notes: "" },
    { lesson: "lesson-1", student: "s2", dateKey: 20261017, status: "حاضر", notes: "" },
  ]);
  const audit = auditStub();
  const controller = load("Attendance/Attendance.controller.js", {
    "./Attendance.model": { AttendanceModelDef: attendance },
    "../Lesson/Lesson.model": { LessonModelDef: lessons },
    "../User/User.model": { UserModelDef: createStore() },
    "../Student/Student.model": { StudentModelDef: createStore() },
    "../../utils/permissions": require("../utils/permissions"),
    "../../utils/studentScope": require("../utils/studentScope"),
    "../../utils/attendanceMarks": require("../utils/attendanceMarks"),
    "../../middleware/logger": { logWithSource() {} },
    ...audit.deps,
  });

  const res = createRes();
  await controller.bulkSave(req({ body: {
    lessonId: "lesson-1", year: 2026, month: 10, day: 17,
    items: [
      { studentId: "s1", status: "حاضر", notes: "" }, // unchanged
      { studentId: "s2", status: "غائب", notes: "" }, // changed
      { studentId: "s3", status: "غائب", notes: "" }, // new
    ],
  } }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(audit.calls.length, 1, "one row per save, not per student");
  const [row] = audit.calls;
  assert.equal(row.module, "attendance");
  assert.equal(row.action, "update");
  assert.equal(row.targetId, "lesson-1");
  assert.match(row.targetLabel, /Math/);
  assert.match(row.targetLabel, /2026-10-17/);
  assert.equal(row.after.date, "2026-10-17");
  assert.equal(row.after.rowsChanged, 2);

  const bad = createRes();
  await controller.bulkSave(req({ body: { lessonId: "lesson-1" } }), bad);
  assert.equal(bad.statusCode, 400);
  assert.equal(audit.calls.length, 1);
});

/* ================= the system account ================= */

// A synthetic, checksum-valid ID number (not a real person).
const SYSTEM_TZ = "000000026";
const SYS = { _id: "e".repeat(24), tz: SYSTEM_TZ, firstname: "Sys", lastname: "Tem", roles: [] };
const TEACHER = { _id: "t".repeat(24), tz: "222222226", firstname: "Te", lastname: "Acher", roles: ["مرشد"] };

async function withSystemTz(fn) {
  const had = Object.hasOwn(process.env, "SYSTEM_ADMIN_TZ");
  const previous = process.env.SYSTEM_ADMIN_TZ;
  process.env.SYSTEM_ADMIN_TZ = SYSTEM_TZ;
  try { return await fn(); } finally { if (had) process.env.SYSTEM_ADMIN_TZ = previous; else delete process.env.SYSTEM_ADMIN_TZ; }
}

test("the system account cannot be a lesson teacher or helper", async () => {
  await withSystemTz(async () => {
    const lesson = { name: "Math", room: "1", date: { day: 2, startMin: 600, endMin: 645 } };
    for (const role of ["teacher", "helper"]) {
      const { controller, lessons, audit } = lessonSetup([], [SYS, TEACHER]);
      const out = createRes();
      await controller.postOne(req({ body: { ...lesson, teacher: TEACHER._id, [role]: SYS._id } }), out);
      assert.equal(out.statusCode, 400, role);
      assert.equal(lessons.all().length, 0);
      assert.equal(audit.calls.length, 0);
    }

    const { controller, lessons } = lessonSetup([{ _id: "lesson-1", ...lesson, teacher: TEACHER._id, helper: null }], [SYS, TEACHER]);
    for (const role of ["teacher", "helper"]) {
      const out = createRes();
      await controller.putOne(req({ params: { id: "lesson-1" }, body: { [role]: SYS._id } }), out);
      assert.equal(out.statusCode, 400, role);
    }
    assert.equal(lessons.all()[0].teacher, TEACHER._id);
    assert.equal(lessons.all()[0].helper, null);

    const ok = createRes();
    await controller.putOne(req({ params: { id: "lesson-1" }, body: { name: "Algebra" } }), ok);
    assert.equal(ok.statusCode, 200);
  });
});

test("an attendance sheet names a system teacher \"النظام\"", async () => {
  await withSystemTz(async () => {
    const controller = load("Attendance/Attendance.controller.js", {
      "./Attendance.model": { AttendanceModelDef: createStore() },
      "../Lesson/Lesson.model": { LessonModelDef: createStore([{ _id: "lesson-1", name: "Math", teacher: SYS._id, list_students: [], date: { day: 2 } }]) },
      "../User/User.model": { UserModelDef: createStore([SYS]) },
      "../Student/Student.model": { StudentModelDef: createStore() },
      "../../utils/permissions": require("../utils/permissions"),
      "../../utils/studentScope": require("../utils/studentScope"),
      "../../utils/attendanceMarks": require("../utils/attendanceMarks"),
      "../../middleware/logger": { logWithSource() {} },
      ...auditStub().deps,
    });
    const out = createRes();
    await controller.getSheet(req({ query: { lessonId: "lesson-1", year: 2026, month: 10, day: 17 } }), out);
    assert.equal(out.statusCode, 200);
    assert.equal(out.body.schema.teacherName, "النظام");
    assert.ok(!JSON.stringify(out.body).includes(SYSTEM_TZ));
  });
});

test("a teacher or helper value that is not an ObjectId is not looked up (no CastError, no 500)", async () => {
  await withSystemTz(async () => {
    // Like Mongoose: an _id filter that is not 24 hex characters throws a CastError.
    const users = createStore([SYS, TEACHER]);
    const strictUsers = {
      ...users,
      async get(filter = {}) {
        if (filter._id !== undefined && !/^[0-9a-fA-F]{24}$/.test(String(filter._id))) {
          const error = new Error(`Cast to ObjectId failed for value "${filter._id}"`);
          error.name = "CastError";
          throw error;
        }
        return users.get(filter);
      },
    };
    const lessons = createStore();
    const controller = load("Lesson/Lesson.controller.js", {
      "./Lesson.model": { LessonModelDef: lessons },
      "../Sport/SportLesson.model": { SportLessonModelDef: { async get() { return { success: true, result: [] }; } } },
      "../../utils/lessonConflict": require("../utils/lessonConflict"),
      "../User/User.model": { UserModelDef: strictUsers },
      "../../utils/permissions": require("../utils/permissions"),
      "../../middleware/logger": { logWithSource() {} },
      "../Notification/Notification.controller": {},
      "../Student/Student.model": { StudentModelDef: createStore() },
      "../../utils/studentScope": require("../utils/studentScope"),
      "../../utils/attendanceMarks": require("../utils/attendanceMarks"),
      ...auditStub().deps,
    });
    const lesson = { name: "Math", room: "1", date: { day: 2, startMin: 600, endMin: 645 } };
    const out = createRes();
    await controller.postOne(req({ body: { ...lesson, teacher: "not-an-object-id" } }), out);
    assert.equal(out.statusCode, 201);

    const blocked = createRes();
    await controller.postOne(req({ body: { ...lesson, date: { day: 3, startMin: 600, endMin: 645 }, teacher: "not-an-object-id", helper: SYS._id } }), blocked);
    assert.equal(blocked.statusCode, 400, "the system account is still refused");
  });
});

/* ================= nightly absences are marked automatic ================= */

test("the nightly job marks the rows it creates auto: true; a teacher's save sets auto: false", async () => {
  const { AUTO_ABSENCE_NOTE } = require("../utils/attendanceMarks");
  const lessons = createStore([{ _id: "lesson-1", name: "Math", date: { day: 7, startMin: 600, endMin: 645 }, list_students: ["s1", "s2"] }]);
  const attendance = createStore([{ lesson: "lesson-1", student: "s1", dateKey: 20261017, status: "حاضر", notes: "" }]);
  const controller = load("Attendance/Attendance.controller.js", {
    "./Attendance.model": { AttendanceModelDef: attendance },
    "../Lesson/Lesson.model": { LessonModelDef: lessons },
    "../User/User.model": { UserModelDef: createStore() },
    "../Student/Student.model": { StudentModelDef: createStore() },
    "../../utils/permissions": require("../utils/permissions"),
    "../../utils/studentScope": require("../utils/studentScope"),
    "../../utils/attendanceMarks": require("../utils/attendanceMarks"),
    "../../middleware/logger": { logWithSource() {} },
    ...auditStub().deps,
  });
  await controller.runDailyAbsenceJob({ year: 2026, month: 10, day: 17, dow1to7: 7 });
  const auto = attendance.all().find((r) => r.student === "s2");
  assert.equal(auto.status, "غائب");
  assert.equal(auto.auto, true);
  assert.equal(auto.notes, AUTO_ABSENCE_NOTE);
  assert.equal(attendance.all().find((r) => r.student === "s1").auto, undefined);

  await controller.bulkSave(req({ body: {
    lessonId: "lesson-1", year: 2026, month: 10, day: 17,
    items: [{ studentId: "s2", status: "غائب", notes: AUTO_ABSENCE_NOTE }],
  } }), createRes());
  assert.equal(attendance.all().find((r) => r.student === "s2").auto, false);
});

/* ================= overwritten marks (conflict signal) ================= */

test("bulk-save reports students whose mark was replaced by a different user", async () => {
  const lessons = createStore([{ _id: "lesson-1", name: "Math", date: { day: 7, startMin: 600, endMin: 645 }, list_students: ["s1", "s2"] }]);
  const attendance = createStore([{ lesson: "lesson-1", student: "s2", dateKey: 20261017, status: "غائب", notes: "", auto: true }]);
  const controller = load("Attendance/Attendance.controller.js", {
    "./Attendance.model": { AttendanceModelDef: attendance },
    "../Lesson/Lesson.model": { LessonModelDef: lessons },
    "../User/User.model": { UserModelDef: createStore() },
    "../Student/Student.model": { StudentModelDef: createStore() },
    "../../utils/permissions": require("../utils/permissions"),
    "../../utils/studentScope": require("../utils/studentScope"),
    "../../utils/attendanceMarks": require("../utils/attendanceMarks"),
    "../../middleware/logger": { logWithSource() {} },
    ...auditStub().deps,
  });
  const userB = { _id: "b".repeat(24), tz: "222222226", roles: ["ادارة"] };
  const reqB = (extra) => ({ ...req(extra), actor: actorFor(userB) });
  const save = async (r, items) => {
    const out = createRes();
    await controller.bulkSave(r({ body: { lessonId: "lesson-1", year: 2026, month: 10, day: 17, items } }), out);
    return out;
  };

  const first = await save(req, [{ studentId: "s1", status: "حاضر" }]);
  assert.deepEqual([...first.body.overwritten], []);
  assert.equal(attendance.all().find((r) => r.student === "s1").updatedBy, ADMIN._id);

  const same = await save(req, [{ studentId: "s1", status: "غائب" }]);
  assert.deepEqual([...same.body.overwritten], [], "own row");

  assert.deepEqual([...(await save(reqB, [{ studentId: "s1", status: "غائب" }])).body.overwritten], [], "same status");
  await save(req, [{ studentId: "s1", status: "غائب" }]);
  assert.deepEqual([...(await save(reqB, [{ studentId: "s1", status: "حاضر" }])).body.overwritten], ["s1"]);
  assert.equal(attendance.all().find((r) => r.student === "s1").updatedBy, userB._id);

  assert.deepEqual([...(await save(req, [{ studentId: "s2", status: "حاضر" }])).body.overwritten], [], "auto row has no updatedBy");

  await save(req, [{ studentId: "s1", status: "حاضر" }]);
  await save(req, [{ studentId: "s1", status: "حاضر" }]);
  assert.equal(attendance.all().filter((r) => r.student === "s1").length, 1);
});

test("lesson writes stamp updatedAt, announce the change, and a stale form save is 409 with nothing announced", async () => {
  const { controller, lessons } = lessonSetup();
  live.changes.length = 0;
  const created = createRes();
  await controller.postOne(req({ body: { name: "Math", teacher: "t1", room: "1", date: { day: 2, startMin: 600, endMin: 645 } } }), created);
  const id = lessons.all()[0]._id;
  assert.deepEqual(live.changes, [["lesson", id]]);

  live.changes.length = 0;
  const first = createRes();
  await controller.putOne(req({ params: { id }, body: { name: "A", baseVersion: "2000-01-01T00:00:00.000Z" } }), first);
  assert.equal(first.statusCode, 200, "no stored version yet, nothing to be stale against");
  const stored = lessons.all()[0];
  assert.ok(Number.isFinite(Date.parse(stored.updatedAt)));
  assert.deepEqual(live.changes, [["lesson", id]]);

  live.changes.length = 0;
  const stale = createRes();
  await controller.putOne(req({ params: { id }, body: { name: "B", baseVersion: "2000-01-01T00:00:00.000Z" } }), stale);
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.body.code, "STALE");
  assert.equal(stale.body.current.name, "A");
  assert.deepEqual(live.changes, []);
  assert.equal(lessons.all()[0].name, "A");

  const fresh = createRes();
  await controller.putOne(req({ params: { id }, body: { name: "C", baseVersion: new Date(stored.updatedAt).toISOString() } }), fresh);
  assert.equal(fresh.statusCode, 200);

  // Roster add/remove and delete take no version check but announce and stamp.
  live.changes.length = 0;
  await controller.addToList(req({ params: { id }, body: { list_students: ["s1"], baseVersion: "2000-01-01T00:00:00.000Z" } }), createRes());
  await controller.removeFromList(req({ params: { id }, body: { list_students: ["s1"] } }), createRes());
  await controller.deleteOne(req({ params: { id } }), createRes());
  assert.deepEqual(live.changes, [["lesson", id], ["lesson", id], ["lesson", id]]);
});

test("attendance bulk-save: refused (409) on top of an older sheet, otherwise announced; the sheet reports its version", async () => {
  const lessons = createStore([{ _id: "lesson-1", name: "Math", date: { day: 2, startMin: 600, endMin: 645 }, list_students: ["s1"] }]);
  const attendance = createStore([
    { lesson: "lesson-1", student: "s1", dateKey: 20261025, status: "حاضر", notes: "", updatedAt: new Date("2026-10-25T10:00:00.000Z") },
    { lesson: "lesson-1", student: "s2", dateKey: 20261025, status: "حاضر", notes: "", updatedAt: new Date("2026-10-25T10:05:00.000Z") },
  ]);
  const audit = auditStub();
  const controller = load("Attendance/Attendance.controller.js", {
    "./Attendance.model": { AttendanceModelDef: attendance },
    "../Lesson/Lesson.model": { LessonModelDef: lessons },
    "../User/User.model": { UserModelDef: createStore() },
    "../Student/Student.model": { StudentModelDef: createStore([{ _id: "s1", tz: "1", firstname: "A", lastname: "B" }]) },
    "../../utils/permissions": require("../utils/permissions"),
    "../../utils/studentScope": require("../utils/studentScope"),
    "../../utils/attendanceMarks": require("../utils/attendanceMarks"),
    "../../middleware/logger": { logWithSource() {} },
    ...audit.deps,
  });
  const body = (baseVersion) => ({ lessonId: "lesson-1", year: 2026, month: 10, day: 25, items: [{ studentId: "s1", status: "غائب" }], baseVersion });

  const sheet = createRes();
  await controller.getSheet(req({ query: { lessonId: "lesson-1", year: "2026", month: "10", day: "25" } }), sheet);
  assert.equal(sheet.body.schema.version, "2026-10-25T10:05:00.000Z");

  live.changes.length = 0;
  const stale = createRes();
  await controller.bulkSave(req({ body: body("2026-10-25T10:00:00.000Z") }), stale);
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.body.code, "STALE");
  assert.equal(attendance.all().find((r) => r.student === "s1").status, "حاضر", "nothing written");
  assert.deepEqual(live.changes, []);

  const ok = createRes();
  await controller.bulkSave(req({ body: body("2026-10-25T10:05:00.000Z") }), ok);
  assert.equal(ok.statusCode, 200);
  assert.deepEqual(live.changes, [["attendance", "lesson-1:2026-10-25"]]);
  assert.ok(new Date(attendance.all().find((r) => r.student === "s1").updatedAt) > new Date("2026-10-25T10:05:00.000Z"));
});
