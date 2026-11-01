const assert = require("node:assert/strict");
const live = require("./helpers/liveStubs");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { actorFor } = require("./helpers/actors");
const { auditStub } = require("./helpers/auditStub");

// The owner's rule (2026-11-01): a guide or assistant sees only the lessons
// he teaches or assists in, everywhere lessons are read; an admin sees all.
// The list carries the staff names, so no screen needs the user list.

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
const ADMIN_U = { _id: id("a"), tz: "1", firstname: "Ad", lastname: "Min", roles: ["ادارة"] };
const GUIDE_U = { _id: id("b"), tz: "2", firstname: "Gu", lastname: "Ide", phone: "050", roles: ["مرشد"] };
const HELPER_U = { _id: id("c"), tz: "3", firstname: "He", lastname: "Lper", roles: ["مساعد"] };
const OTHER_U = { _id: id("d"), tz: "4", firstname: "Ot", lastname: "Her", roles: ["مرشد"] };
const USERS = [ADMIN_U, GUIDE_U, HELPER_U, OTHER_U];
const today = ((new Date().getDay()) % 7) + 1;
const LESSONS = [
  { _id: id("1"), name: "Mine", teacher: GUIDE_U._id, helper: HELPER_U._id, room: "1", date: { day: today, startMin: 600 }, list_students: [] },
  { _id: id("2"), name: "Other", teacher: OTHER_U._id, helper: null, room: "2", date: { day: today, startMin: 600 }, list_students: [] },
];

function world({ lessonList = LESSONS, studentList = [] } = {}) {
  const lessons = {
    dbName: "tamheed_db", collections: { active: "Lessons" },
    async get(filter = {}) {
      const match = (l) => Object.entries(filter).every(([k, v]) => {
        if (k === "_id") return String(l._id) === String(v);
        if (k === "date.day") return l.date.day === v;
        return String(l[k]) === String(v);
      });
      return { success: true, result: lessonList.filter(match).map((l) => ({ ...l })) };
    },
  };
  const users = { async get(filter) { return { success: true, result: USERS.filter((u) => !filter._id || u._id === String(filter._id)) }; } };
  const sport = { async get() { return { success: true, result: [{ _id: id("9"), name: "Football", date: { day: 2, startMin: 1000 } }] }; } };
  const none = { async get() { return { success: true, result: [] }; } };
  // Students: matched on _id or main_teacher (a string or { $in }).
  const students = { async get(filter = {}) {
    const want = (v, x) => (v && typeof v === "object" && v.$in ? v.$in.map(String).includes(String(x)) : String(v) === String(x));
    return { success: true, result: studentList.filter((s) => Object.entries(filter).every(([k, v]) => want(v, s[k]))) };
  } };
  return load("Lesson/Lesson.controller.js", {
    "../../utils/permissions": require("../utils/permissions"),
    "../../utils/studentScope": require("../utils/studentScope"),
    "../../utils/lessonAccess": require("../utils/lessonAccess"),
    "../../middleware/logger": { logWithSource() {} },
    "../Notification/Notification.controller": {},
    ...auditStub().deps,
    "./Lesson.model": { LessonModelDef: lessons },
    "../Sport/SportLesson.model": { SportLessonModelDef: sport },
    "../../utils/lessonConflict": require("../utils/lessonConflict"),
    "../Student/Student.model": { StudentModelDef: students },
    "../User/User.model": { UserModelDef: users },
  });
}

async function call(handler, user, req = {}) {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = JSON.parse(JSON.stringify(v)); return this; } };
  await handler({ actor: actorFor(user), user: { id: user._id }, params: {}, query: {}, body: {}, ...req }, res);
  return res;
}
const names = (res) => res.body.lessons.map((l) => l.name);

for (const [label, handler] of [["getAll", "getAll"], ["today", "getLessonsByToDay"], ["query", "getLessonsByQuery"]]) {
  test(`${label}: a guide gets only his lessons, an assistant only his, an admin all`, async () => {
    const c = world();
    assert.deepEqual(names(await call(c[handler], GUIDE_U)), ["Mine"]);
    assert.deepEqual(names(await call(c[handler], HELPER_U)), ["Mine"]);
    assert.deepEqual(names(await call(c[handler], OTHER_U)), ["Other"]);
    assert.deepEqual(names(await call(c[handler], ADMIN_U)), ["Mine", "Other"]);
  });
}

test("getOne: another guide's lesson is not found for a guide; an admin opens it", async () => {
  const c = world();
  assert.equal((await call(c.getOne, GUIDE_U, { params: { id: id("2") } })).statusCode, 404);
  assert.equal((await call(c.getOne, GUIDE_U, { params: { id: id("1") } })).statusCode, 200);
  assert.equal((await call(c.getOne, HELPER_U, { params: { id: id("1") } })).statusCode, 200);
  assert.equal((await call(c.getOne, ADMIN_U, { params: { id: id("2") } })).statusCode, 200);
});

test("the football schedule is for those who see every lesson", async () => {
  const c = world();
  assert.deepEqual((await call(c.getSportSchedule, GUIDE_U)).body.lessons, []);
  assert.equal((await call(c.getSportSchedule, ADMIN_U)).body.lessons.length, 1);
});

test("the list carries the staff names of the lessons it returns, and only those", async () => {
  const c = world();
  const guide = (await call(c.getAll, GUIDE_U)).body;
  assert.deepEqual(guide.names, { [GUIDE_U._id]: "Gu Ide", [HELPER_U._id]: "He Lper" });
  const admin = (await call(c.getAll, ADMIN_U)).body;
  assert.equal(admin.names[OTHER_U._id], "Ot Her");
});

// The owner's rule (2026-11-01): the responsible guide sees everything about
// his student, so he may view another guide's lesson his student attends.
const MY_STUDENT = { _id: id("8"), tz: "5", firstname: "Ki", lastname: "D", main_teacher: GUIDE_U._id };
const WITH_MY_STUDENT = [LESSONS[0], { ...LESSONS[1], list_students: [MY_STUDENT._id, id("7")] }];

test("getOne: a guide views another guide's lesson that holds his responsible student; only his student is named", async () => {
  const c = world({ lessonList: WITH_MY_STUDENT, studentList: [MY_STUDENT] });
  const res = await call(c.getOne, GUIDE_U, { params: { id: id("2") } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.lesson.list_students, [MY_STUDENT._id]);
  assert.equal(res.body.lesson.hiddenCount, 1);
  // The assistant of the guide's lesson has no student there: still not found.
  assert.equal((await call(c.getOne, HELPER_U, { params: { id: id("2") } })).statusCode, 404);
});

test("the lesson lists stay the guide's own lessons even when his student attends another", async () => {
  const c = world({ lessonList: WITH_MY_STUDENT, studentList: [MY_STUDENT] });
  assert.deepEqual(names(await call(c.getAll, GUIDE_U)), ["Mine"]);
});
