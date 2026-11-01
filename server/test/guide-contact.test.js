const assert = require("node:assert/strict");
const live = require("./helpers/liveStubs");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { actorFor } = require("./helpers/actors");
const { auditStub } = require("./helpers/auditStub");
const { guideContact } = require("../utils/guideContact");

// The guide's name and phone sent with a student (its responsible guide) and
// with a lesson (its teacher and helper): to anyone who can see the record,
// with the guide's tz only for users.view holders. Nothing else of the user.

function createStore(seed = []) {
  const docs = seed.map((doc) => structuredClone(doc));
  // Plain equality and { $in: [...] } (the student scope matches ids that way).
  const matchOne = (value, cond) => (cond && typeof cond === "object" && Array.isArray(cond.$in)
    ? cond.$in.some((c) => String(value) === String(c))
    : String(value) === String(cond));
  const matches = (doc, filter = {}) => Object.keys(filter).every((k) => matchOne(doc[k], filter[k]));
  return {
    dbName: "tamheed_db",
    collections: { active: "X" },
    async get(filter = {}) { return { success: true, result: docs.filter((d) => matches(d, filter)).map((d) => structuredClone(d)) }; },
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

const createRes = () => ({ statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });
const call = async (handler, req) => { const res = createRes(); await handler(req, res); return res; };

/* synthetic people and ids */
const SYSTEM_TZ = "000000026";
const ADMIN = { _id: "a".repeat(24), tz: "900000001", firstname: "Ad", lastname: "Min", roles: ["ادارة"] };
const GUIDE = { _id: "b".repeat(24), tz: "900000002", firstname: "سامي", lastname: "علي", phone: "050-1111111", email: "g@example.test", roles: ["مرشد"] };
const SYS = { _id: "e".repeat(24), tz: SYSTEM_TZ, firstname: "Sys", lastname: "Tem", phone: "0", roles: [] };
const GONE = "d".repeat(24); // a guide no longer among the active users
const STUDENTS = [
  { _id: "5".repeat(24), tz: "800000001", firstname: "F1", lastname: "L1", main_teacher: GUIDE._id },
  { _id: "6".repeat(24), tz: "800000002", firstname: "F2", lastname: "L2", main_teacher: GONE },
];
const LESSONS = [{ _id: "lesson-1", name: "Mine", teacher: GUIDE._id, helper: null, room: "1", date: { day: 2, startMin: 600, endMin: 645 }, list_students: [STUDENTS[0]._id] }];

const reqAs = (user, extra = {}) => ({ user: { id: user._id, tz: user.tz, roles: user.roles }, actor: actorFor(user), params: {}, query: {}, body: {}, ...extra });

function world(lessonList = LESSONS) {
  const students = createStore(STUDENTS);
  const lessons = createStore(lessonList);
  const users = createStore([ADMIN, GUIDE, SYS]);
  const common = {
    "../../utils/permissions": require("../utils/permissions"),
    "../../utils/studentScope": require("../utils/studentScope"),
    "../../middleware/logger": { logWithSource() {} },
    "../Notification/Notification.controller": {},
    ...auditStub().deps,
  };
  const student = load("Student/Student.controller.js", {
    ...common,
    "./Student.model": { StudentModelDef: students },
    "../Lesson/Lesson.model": { LessonModelDef: lessons },
    "../User/User.model": { UserModelDef: users },
    "../UploadFile/file": { async handleUpload() { return {}; }, async handleDeleteByUrl() { return {}; } },
  });
  const lesson = load("Lesson/Lesson.controller.js", {
    ...common,
    "./Lesson.model": { LessonModelDef: lessons },
    "../Sport/SportLesson.model": { SportLessonModelDef: { async get() { return { success: true, result: [] }; } } },
    "../../utils/lessonConflict": require("../utils/lessonConflict"),
    "../Student/Student.model": { StudentModelDef: students },
    "../User/User.model": { UserModelDef: users },
  });
  return { student, lesson };
}

async function withSystemTz(fn) {
  const had = Object.hasOwn(process.env, "SYSTEM_ADMIN_TZ");
  const previous = process.env.SYSTEM_ADMIN_TZ;
  process.env.SYSTEM_ADMIN_TZ = SYSTEM_TZ;
  try { return await fn(); } finally { if (had) process.env.SYSTEM_ADMIN_TZ = previous; else delete process.env.SYSTEM_ADMIN_TZ; }
}

test("guideContact gives name and phone, and the tz only to a users.view holder", () => {
  assert.deepEqual(guideContact(GUIDE, actorFor(GUIDE)), { name: "سامي علي", phone: "050-1111111" });
  assert.deepEqual(guideContact(GUIDE, actorFor(ADMIN)), { name: "سامي علي", phone: "050-1111111", tz: "900000002" });
});

test("guideContact gives null for no user and for the system account", () => withSystemTz(() => {
  assert.equal(guideContact(null, actorFor(ADMIN)), null);
  assert.equal(guideContact(SYS, actorFor(ADMIN)), null);
}));

test("a guide opening a student he is responsible for gets the guide's name and phone only", async () => {
  const res = await call(world().student.getOneS, reqAs(GUIDE, { params: { tz: "800000001" } }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(res.body.student.guide).sort(), ["name", "phone"]);
  assert.equal(res.body.student.guide.name, "سامي علي");
});

test("a student whose stored guide is no longer an active user answers guide null", async () => {
  const res = await call(world().student.getOneS, reqAs(ADMIN, { params: { tz: "800000002" } }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.student.guide, null);
});

test("a lesson answers its teacher's contact and a null helper contact", async () => {
  const res = await call(world().lesson.getOne, reqAs(ADMIN, { params: { id: "lesson-1" } }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.lesson.teacherContact, { name: "سامي علي", phone: "050-1111111", tz: "900000002" });
  assert.equal(res.body.lesson.helperContact, null);
});

test("a malformed guide id gives null without querying (no CastError, no 500)", async () => {
  const { contactById } = require("../utils/guideContact");
  const users = { async get(filter) { if (!/^[0-9a-f]{24}$/i.test(String(filter._id))) throw new Error("CastError"); return { result: [GUIDE] }; } };
  assert.equal(await contactById(users, "not-an-id", actorFor(ADMIN)), null);
  assert.deepEqual(await contactById(users, GUIDE._id, actorFor(GUIDE)), { name: "سامي علي", phone: "050-1111111" });
});

// The owner's rule (2026-11-01): the responsible guide sees all of his
// student's lessons; another guide sees only the ones he is on; an admin all.
const G2 = { _id: "c".repeat(24), tz: "900000003", firstname: "Ot", lastname: "Her", roles: ["مرشد"] };
const BOTH = [...LESSONS, { _id: "lesson-2", name: "Other", teacher: G2._id, helper: null, room: "2", date: { day: 3, startMin: 600, endMin: 645 }, list_students: [STUDENTS[0]._id] }];
const lessonNames = (res) => res.body.student.lessons.map((l) => l.name).sort();

test("the student page lists all the student's lessons for his responsible guide", async () => {
  const res = await call(world(BOTH).student.getOneS, reqAs(GUIDE, { params: { tz: "800000001" } }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(lessonNames(res), ["Mine", "Other"]);
  assert.deepEqual(Object.keys(res.body.student.lessons[0]).sort(), ["_id", "date", "name", "room"]);
});

test("another guide sees only the student's lessons he is on; an admin sees all", async () => {
  const other = await call(world(BOTH).student.getOneS, reqAs(G2, { params: { tz: "800000001" } }));
  assert.deepEqual(lessonNames(other), ["Other"]);
  const admin = await call(world(BOTH).student.getOneS, reqAs(ADMIN, { params: { tz: "800000001" } }));
  assert.deepEqual(lessonNames(admin), ["Mine", "Other"]);
});
