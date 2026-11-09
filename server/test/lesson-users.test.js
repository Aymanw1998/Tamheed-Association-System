const assert = require("node:assert/strict");
const live = require("./helpers/liveStubs");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { actorFor } = require("./helpers/actors");
const { auditStub } = require("./helpers/auditStub");
const { memoryModel } = require("./helpers/memoryModel");

// Users (staff) as lesson participants (owner, 2026-11-09): list_users on a
// lesson, managed with lessons.staffRoster; a lesson's teacher or helper is
// never also one of its participants. Synthetic ids and names only.

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
const NO_STAFF_KEY = { ...ADMIN, _id: id("e"), tz: "900000005", permissionRevokes: ["lessons.staffRoster"] };
const GUIDE = { _id: id("b"), tz: "900000002", firstname: "مرشد", lastname: "ب", role: "مرشد" };
const HELPER = { _id: id("c"), tz: "900000003", firstname: "مساعد", lastname: "ج", role: "مساعد" };
const STAFF1 = { _id: id("d"), tz: "900000004", firstname: "موظف", lastname: "د", role: "مساعد" };
const STAFF2 = { _id: id("f"), tz: "900000006", firstname: "موظفة", lastname: "و", role: "مرشد" };
const FORMER = { _id: id("9"), tz: "900000009", firstname: "سابق", lastname: "", role: "مساعد" };
const LESSON_ID = id("1");
const OTHER_ID = id("2");
const DATE = { day: 3, startMin: 900, endMin: 960 };

function world({ lessonList } = {}) {
  const stored = (lessonList || [
    { _id: LESSON_ID, name: "برنامج", teacher: GUIDE._id, helper: HELPER._id, room: "1", date: DATE, list_students: [], list_users: [STAFF1._id] },
    { _id: OTHER_ID, name: "آخر", teacher: STAFF2._id, helper: null, room: "2", date: DATE, list_students: [], list_users: [] },
  ]).map((l) => ({ ...l }));
  const lessons = memoryModel(stored);
  Object.assign(lessons, {
    dbName: "tamheed_db", collections: { active: "Lessons" },
    created: [],
    async create(doc) { const row = { _id: id("7"), ...doc }; stored.push(row); this.created.push(row); return { success: true, result: row }; },
    async updateExisting(filter, patch) {
      const row = stored.find((l) => String(l._id) === String(filter._id));
      if (!row || String(row.updatedAt ?? null) !== String(filter.updatedAt ?? null)) return { success: true, result: null };
      Object.assign(row, patch);
      return { success: true, result: { ...row } };
    },
  });
  const users = memoryModel({ active: [ADMIN, NO_STAFF_KEY, GUIDE, HELPER, STAFF1, STAFF2], noActive: [FORMER] });
  const none = { async get() { return { success: true, result: [] }; } };
  const audit = auditStub();
  const deps = (extra = {}) => ({
    "../../utils/permissions": require("../utils/permissions"),
    "../../utils/studentScope": require("../utils/studentScope"),
    "../../utils/lessonAccess": require("../utils/lessonAccess"),
    "../../utils/lessonParticipants": require("../utils/lessonParticipants"),
    "../../middleware/logger": { logWithSource() {} },
    "../Notification/Notification.controller": {},
    ...audit.deps,
    "./Lesson.model": { LessonModelDef: lessons },
    "../Sport/SportLesson.model": { SportLessonModelDef: none },
    "../../utils/lessonConflict": require("../utils/lessonConflict"),
    "../Student/Student.model": { StudentModelDef: none },
    "../User/User.model": { UserModelDef: users },
    ...extra,
  });
  const controller = load("Lesson/Lesson.controller.js", deps());
  const reload = (extra) => load("Lesson/Lesson.controller.js", deps(extra));
  const lessonById = (lid) => stored.find((l) => String(l._id) === String(lid));
  return { controller, reload, stored, lessons, audit, lessonById };
}

async function call(handler, user, req = {}) {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = JSON.parse(JSON.stringify(v)); return this; } };
  await handler({ actor: actorFor(user), user: { id: user._id }, params: {}, query: {}, body: {}, headers: {}, ...req }, res);
  return res;
}

// Another day, so the same teacher is free (no time clash with LESSON_ID).
const newLesson = (extra = {}) => ({ name: "جديد", teacher: GUIDE._id, helper: HELPER._id, room: "3", date: { ...DATE, day: 4 }, ...extra });

/* ---------- Task 3: create, edit and read ---------- */

test("an admin creating a lesson stores the users he listed", async () => {
  const w = world();
  const res = await call(w.controller.postOne, ADMIN, { body: newLesson({ list_users: [STAFF1._id, STAFF2._id] }) });
  assert.equal(res.statusCode, 201);
  assert.deepEqual([...w.lessons.created[0].list_users], [STAFF1._id, STAFF2._id]);
});

test("creating a lesson with its own teacher as a participant is refused", async () => {
  const w = world();
  const res = await call(w.controller.postOne, ADMIN, { body: newLesson({ list_users: [STAFF1._id, GUIDE._id] }) });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "STAFF_IS_PARTICIPANT");
  assert.equal(w.lessons.created.length, 0);
});

test("without lessons.staffRoster the users in a new lesson are ignored", async () => {
  const w = world();
  const res = await call(w.controller.postOne, NO_STAFF_KEY, { body: newLesson({ list_users: [STAFF1._id] }) });
  assert.equal(res.statusCode, 201);
  assert.deepEqual([...w.lessons.created[0].list_users], []);
});

test("an edit that makes a participant the helper is refused and changes nothing", async () => {
  const w = world();
  const res = await call(w.controller.putOne, ADMIN, { params: { id: LESSON_ID }, body: { helper: STAFF1._id } });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "STAFF_IS_PARTICIPANT");
  assert.equal(w.lessonById(LESSON_ID).helper, HELPER._id);
});

test("an edit without list_users keeps the stored participants", async () => {
  const w = world();
  const res = await call(w.controller.putOne, ADMIN, { params: { id: LESSON_ID }, body: { name: "اسم جديد" } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual([...w.lessonById(LESSON_ID).list_users], [STAFF1._id]);
});

test("without lessons.staffRoster an edit cannot change the participants", async () => {
  const w = world();
  const res = await call(w.controller.putOne, NO_STAFF_KEY, { params: { id: LESSON_ID }, body: { list_users: [STAFF2._id] } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual([...w.lessonById(LESSON_ID).list_users], [STAFF1._id]);
});

test("an admin's edit replaces the participants with the addable ones", async () => {
  const w = world();
  const res = await call(w.controller.putOne, ADMIN, { params: { id: LESSON_ID }, body: { list_users: [STAFF2._id, FORMER._id] } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual([...w.lessonById(LESSON_ID).list_users], [STAFF2._id]);
});

test("a lesson read lists its active participants by name", async () => {
  const w = world();
  w.lessonById(LESSON_ID).list_users = [STAFF1._id, FORMER._id];
  const res = await call(w.controller.getOne, ADMIN, { params: { id: LESSON_ID } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.lesson.participants, [{ _id: STAFF1._id, name: "موظف د" }]);
  assert.equal(res.body.lesson.num_users, 1);
});

/* ---------- Task 4: add/remove endpoints and the picker list ---------- */

const { Types } = require("mongoose");
const GUIDE_WITH_KEY = { ...GUIDE, permissionGrants: ["lessons.staffRoster"] };

test("adding a user writes him, audits the change and answers the new version", async () => {
  const w = world();
  const res = await call(w.controller.addUsers, ADMIN, { params: { id: LESSON_ID }, body: { list_users: [STAFF2._id] } });
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.updatedAt);
  assert.deepEqual(res.body.refused, []);
  assert.deepEqual([...w.lessonById(LESSON_ID).list_users], [STAFF1._id, STAFF2._id]);
  assert.equal(w.audit.find({ module: "lessons", action: "update" }).length, 1);
});

test("adding the lesson's own teacher is refused and nothing is written", async () => {
  const w = world();
  const res = await call(w.controller.addUsers, ADMIN, { params: { id: LESSON_ID }, body: { list_users: [STAFF2._id, GUIDE._id] } });
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "STAFF_IS_PARTICIPANT");
  assert.deepEqual([...w.lessonById(LESSON_ID).list_users], [STAFF1._id]);
  assert.equal(w.audit.calls.length, 0);
});

test("a guide manages users only on a lesson he teaches or helps on", async () => {
  const w = world();
  const other = await call(w.controller.addUsers, GUIDE_WITH_KEY, { params: { id: OTHER_ID }, body: { list_users: [STAFF1._id] } });
  assert.equal(other.statusCode, 404);
  assert.deepEqual([...w.lessonById(OTHER_ID).list_users], []);
  const own = await call(w.controller.addUsers, GUIDE_WITH_KEY, { params: { id: LESSON_ID }, body: { list_users: [STAFF2._id] } });
  assert.equal(own.statusCode, 200);
});

test("a user list that is not a list answers 400", async () => {
  const w = world();
  const add = await call(w.controller.addUsers, ADMIN, { params: { id: LESSON_ID }, body: { list_users: STAFF2._id } });
  const remove = await call(w.controller.removeUsers, ADMIN, { params: { id: LESSON_ID }, body: { list_users: "x" } });
  assert.equal(add.statusCode, 400);
  assert.equal(remove.statusCode, 400);
});

test("removing a user stored as an ObjectId really removes him", async () => {
  const w = world();
  w.lessonById(LESSON_ID).list_users = [new Types.ObjectId(STAFF1._id), STAFF2._id];
  const res = await call(w.controller.removeUsers, ADMIN, { params: { id: LESSON_ID }, body: { list_users: [STAFF1._id] } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(w.lessonById(LESSON_ID).list_users.map(String), [STAFF2._id]);
});

test("a write that lost the version race answers 409", async () => {
  const w = world();
  w.lessons.updateExisting = async () => ({ success: true, result: null });
  const res = await call(w.controller.addUsers, ADMIN, { params: { id: LESSON_ID }, body: { list_users: [STAFF2._id] } });
  assert.equal(res.statusCode, 409);
});

test("the picker lists active users and marks the staff and those already on", async () => {
  const w = world();
  const res = await call(w.controller.addableUsersList, ADMIN, { params: { id: LESSON_ID } });
  assert.equal(res.statusCode, 200);
  const byId = Object.fromEntries(res.body.users.map((u) => [u._id, u]));
  assert.equal(byId[GUIDE._id].reason, "STAFF");
  assert.equal(byId[HELPER._id].reason, "STAFF");
  assert.equal(byId[STAFF1._id].reason, "ON_LESSON");
  assert.equal(byId[STAFF2._id].reason, undefined);
  assert.equal(byId[STAFF2._id].name, "موظفة و");
  assert.equal(byId[FORMER._id], undefined);
});

test("the picker of someone else's lesson is not found for a guide", async () => {
  const w = world();
  const res = await call(w.controller.addableUsersList, GUIDE_WITH_KEY, { params: { id: OTHER_ID } });
  assert.equal(res.statusCode, 404);
});

/* ---------- Task 6: a participant's own programs ---------- */

function withAttendance(w, rows) {
  const { memoryModel: mm } = require("./helpers/memoryModel");
  const store = mm(rows);
  const controller = w.reload({ "../Attendance/Attendance.model": { AttendanceModelDef: store } });
  return controller;
}

test("a participant gets his programs with the guides' names and only his own attendance", async () => {
  const w = world();
  const rows = [];
  for (let d = 1; d <= 12; d += 1) rows.push({ lesson: LESSON_ID, user: STAFF1._id, dateKey: 20261100 + d, status: d % 2 ? "حاضر" : "غائب" });
  rows.push({ lesson: LESSON_ID, user: STAFF2._id, dateKey: 20261115, status: "غائب" });
  rows.push({ lesson: LESSON_ID, student: id("5"), dateKey: 20261115, status: "غائب" });
  const controller = withAttendance(w, rows);
  const res = await call(controller.myParticipations, STAFF1);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.lessons.length, 1);
  const [mine] = res.body.lessons;
  assert.equal(mine._id, LESSON_ID);
  assert.equal(mine.name, "برنامج");
  assert.equal(mine.teacherName, "مرشد ب");
  assert.equal(mine.helperName, "مساعد ج");
  assert.equal(mine.attendance.length, 10);
  assert.deepEqual(mine.attendance[0], { dateKey: 20261112, status: "غائب" });
  assert.ok(!("list_students" in mine) && !("list_users" in mine));
});

test("someone on no lesson gets an empty list", async () => {
  const w = world();
  const controller = withAttendance(w, []);
  const res = await call(controller.myParticipations, ADMIN);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.lessons, []);
});

test("being a participant does not open the lesson itself", async () => {
  const w = world();
  const res = await call(w.controller.getOne, STAFF1, { params: { id: LESSON_ID } });
  assert.equal(res.statusCode, 404);
});
