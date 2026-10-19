const assert = require("node:assert/strict");
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
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return module.exports;
}

const ADMIN = { _id: "a".repeat(24), tz: "111111118", firstname: "Ad", lastname: "Min", roles: ["ادارة"] };
const req = (extra = {}) => ({ user: { id: ADMIN._id, tz: ADMIN.tz, roles: ADMIN.roles }, actor: actorFor(ADMIN), params: {}, query: {}, body: {}, ...extra });
const createRes = () => ({ statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });

function lessonSetup(seed = []) {
  const lessons = createStore(seed);
  const audit = auditStub();
  const controller = load("Lesson/Lesson.controller.js", {
    "./Lesson.model": { LessonModelDef: lessons },
    "../../middleware/logger": { logWithSource() {} },
    "../Notification/Notification.controller": {},
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
