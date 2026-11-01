const assert = require("node:assert/strict");
const live = require("./helpers/liveStubs");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { Types } = require("mongoose");
const { actorFor } = require("./helpers/actors");
const { auditStub } = require("./helpers/auditStub");

// POST /lesson/removeFromList/:id with student ids as strings, while the
// lesson stores them as ObjectIds (as MongoDB returns them).

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
const S1 = new Types.ObjectId("5".repeat(24));
const S2 = new Types.ObjectId("6".repeat(24));

test("an admin removing a student stored as an ObjectId really removes them", async () => {
  let stored = { _id: "lesson-1", name: "X", teacher: null, helper: null, room: "1", date: { day: 1, startMin: 600 }, list_students: [S1, S2] };
  const lessons = {
    dbName: "tamheed_db", collections: { active: "Lessons" },
    async get() { return { success: true, result: [{ ...stored, list_students: [...stored.list_students] }] }; },
    async update(filter, patch) { stored = { ...stored, ...patch }; return { success: true, result: stored }; },
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
    "../Student/Student.model": { StudentModelDef: none },
    "../User/User.model": { UserModelDef: none },
  });
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } };
  await lesson.removeFromList({ actor: actorFor(ADMIN), user: { id: ADMIN._id }, params: { id: "lesson-1" }, body: { list_students: [String(S1)] } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(stored.list_students.map(String), [String(S2)]);
});
