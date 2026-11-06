const assert = require("node:assert/strict");
const live = require("./helpers/liveStubs");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { actorFor } = require("./helpers/actors");
const { auditStub } = require("./helpers/auditStub");

// Bad input to the lesson routes answers 4xx in Arabic, never a 500 with the
// database's own message, and never stores an id that is no student.

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

const ADMIN = { _id: "a".repeat(24), tz: "900000001", firstname: "Ad", lastname: "Min", roles: ["ادارة"] };
const REAL = "5".repeat(24);
const WAITING = "7".repeat(24);

function world() {
  let stored = { _id: "lesson-1", name: "X", teacher: null, helper: null, room: "1", date: { day: 1, startMin: 840 }, list_students: [] };
  const lessons = {
    dbName: "tamheed_db", collections: { active: "Lessons" },
    async get() { return { success: true, result: [{ ...stored, list_students: [...stored.list_students] }] }; },
    async update(filter, patch) { stored = { ...stored, ...patch }; return { success: true, result: stored }; },
    async updateExisting(filter, patch) { stored = { ...stored, ...patch }; return { success: true, result: stored }; },
    async create(data) { stored = { _id: "lesson-new", ...data }; return { success: true, result: stored }; },
  };
  const students = {
    async get(filter) {
      const id = String(filter?._id || "");
      if (id === WAITING) return { success: true, result: [{ _id: WAITING, tz: "000000026", status: "ينتظر" }] };
      return { success: true, result: id === REAL ? [{ _id: REAL, tz: "000000018", status: "عادي" }] : [] };
    },
  };
  const none = { async get() { return { success: true, result: [] }; } };
  const lesson = load("Lesson/Lesson.controller.js", {
    "../../utils/permissions": require("../utils/permissions"),
    "../../utils/studentScope": require("../utils/studentScope"),
    "../../middleware/logger": { logWithSource() {} },
    "../Notification/Notification.controller": {},
    ...auditStub().deps,
    "./Lesson.model": { LessonModelDef: lessons },
    "../Sport/SportLesson.model": { SportLessonModelDef: none },
    "../../utils/lessonConflict": require("../utils/lessonConflict"),
    "../Student/Student.model": { StudentModelDef: students },
    "../User/User.model": { UserModelDef: none },
  });
  return { lesson, stored: () => stored };
}

const res = () => ({ statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });
const req = (body) => ({ actor: actorFor(ADMIN), user: { id: ADMIN._id }, params: { id: "lesson-1" }, body });

for (const name of ["addToList", "removeFromList"]) {
  test(`${name} with list_students that is not a list answers 400`, async () => {
    const w = world();
    const out = res();
    await w.lesson[name](req({ list_students: "abc" }), out);
    assert.equal(out.statusCode, 400);
    assert.equal(out.body.ok, false);
  });
}

test("an admin adding an id that is no student stores nothing", async () => {
  const w = world();
  const out = res();
  await w.lesson.addToList(req({ list_students: ["not-a-student", "b".repeat(24), REAL] }), out);
  assert.equal(out.statusCode, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(w.stored().list_students.map(String))), [REAL]);
});

test("a lesson id that is not an ObjectId answers 404 before the handler", () => {
  const { objectIdParam } = require("../middleware/objectIdParam");
  const out = res();
  let next = false;
  objectIdParam({}, out, () => { next = true; }, "xyz");
  assert.equal(next, false);
  assert.equal(out.statusCode, 404);
  assert.equal(out.body.ok, false);
  objectIdParam({}, res(), () => { next = true; }, "a".repeat(24));
  assert.equal(next, true);
});

test("the lesson router checks :id with objectIdParam", () => {
  const src = fs.readFileSync(path.join(__dirname, "../Entities/Lesson/Lesson.route.js"), "utf8");
  assert.match(src, /router\.param\(\s*['"]id['"]\s*,\s*objectIdParam\s*\)/);
});

test("an admin cannot add a student who is still on the waiting list", async () => {
  const w = world();
  const out = res();
  await w.lesson.addToList(req({ list_students: [WAITING, REAL] }), out);
  assert.equal(out.statusCode, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(w.stored().list_students.map(String))), [REAL]);
});

const LESSON_BODY = { name: "Math", teacher: "t".repeat(24), room: "1", date: { day: 2, startMin: 840, endMin: 885 } };

test("an admin creating a lesson stores only existing, accepted students", async () => {
  const w = world();
  const out = res();
  await w.lesson.postOne(req({ ...LESSON_BODY, list_students: ["bogus", WAITING, REAL] }), out);
  assert.equal(out.statusCode, 201, JSON.stringify(out.body));
  assert.deepEqual(JSON.parse(JSON.stringify(w.stored().list_students.map(String))), [REAL]);
});

test("an admin saving the lesson form adds only existing, accepted students and keeps those already on it", async () => {
  const w = world();
  const out = res();
  await w.lesson.putOne(req({ ...LESSON_BODY, list_students: ["bogus", WAITING, REAL] }), out);
  assert.equal(out.statusCode, 200, JSON.stringify(out.body));
  assert.deepEqual(JSON.parse(JSON.stringify(w.stored().list_students.map(String))), [REAL]);
});

for (const [startMin, endMin] of [[779, 840], [780, 1321], [1320, 1320], [900, 840], [-1, 840], [780.5, 840], ["bad", 840], [null, 840], [780, null]]) {
  test(`creation and editing refuse invalid program hours ${startMin}–${endMin} without writing`, async () => {
    for (const operation of ["postOne", "putOne"]) {
      const w = world(); const before = JSON.stringify(w.stored()); const out = res();
      await w.lesson[operation](req({ ...LESSON_BODY, date: { day: 2, startMin, endMin } }), out);
      assert.equal(out.statusCode, 400);
      assert.equal(out.body.code, "PROGRAM_HOURS");
      assert.equal(JSON.stringify(w.stored()), before);
    }
  });
}
for (const [startMin, endMin] of [[780, 825], [1275, 1320]]) {
  test(`creation and editing accept program boundary ${startMin}–${endMin} exactly`, async () => {
    for (const operation of ["postOne", "putOne"]) {
      const w = world(); const out = res();
      await w.lesson[operation](req({ ...LESSON_BODY, date: { day: 2, startMin, endMin } }), out);
      assert.equal(out.statusCode, operation === "postOne" ? 201 : 200);
      assert.equal(w.stored().date.startMin, startMin);
      assert.equal(w.stored().date.endMin, endMin);
    }
  });
}
