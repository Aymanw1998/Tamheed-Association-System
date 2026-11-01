const assert = require("node:assert/strict");
const live = require("./helpers/liveStubs");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { actorFor } = require("./helpers/actors");
const { auditStub } = require("./helpers/auditStub");

// The owner's rule (2026-11-01): the student page shows the student's
// attendance, read-only, to an attendance.view holder. The responsible guide
// and an admin see every row; anyone else only the rows of his own lessons.

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

function store(seed) {
  const want = (v, x) => (v && typeof v === "object" && v.$in ? v.$in.map(String).includes(String(x)) : String(v) === String(x));
  return {
    dbName: "tamheed_db", collections: { active: "X" },
    async get(filter = {}) { return { success: true, result: seed.filter((d) => Object.entries(filter).every(([k, v]) => want(v, d[k]))).map((d) => ({ ...d })) }; },
  };
}

const id = (c) => c.repeat(24);
const ADMIN = { _id: id("a"), tz: "1", firstname: "Ad", lastname: "Min", roles: ["ادارة"] };
const GUIDE = { _id: id("b"), tz: "2", firstname: "Gu", lastname: "Ide", roles: ["مرشد"] };
const HELPER = { _id: id("c"), tz: "3", firstname: "He", lastname: "Lper", roles: ["مساعد"] };
const OTHER = { _id: id("d"), tz: "4", firstname: "Ot", lastname: "Her", roles: ["مرشد"] };
const NO_ATTENDANCE = { ...OTHER, permissionRevokes: ["attendance.view"] };
const KID = { _id: id("8"), tz: "800000001", firstname: "Ki", lastname: "D", main_teacher: GUIDE._id, sportCardHash: "card-hash", sportPasskeys: [{ id: "c1", publicKey: "AQID" }] };
const LESSONS = [
  { _id: id("1"), name: "Mine", teacher: GUIDE._id, helper: HELPER._id, date: { day: 1, startMin: 600 }, list_students: [KID._id] },
  { _id: id("2"), name: "Other", teacher: OTHER._id, helper: null, date: { day: 2, startMin: 600 }, list_students: [KID._id] },
];
const GONE = id("9"); // a lesson deleted since
const ROWS = [
  { lesson: id("1"), student: KID._id, dateKey: 20261019, year: 2026, month: 10, day: 19, status: "حاضر", notes: "" },
  { lesson: id("2"), student: KID._id, dateKey: 20261020, year: 2026, month: 10, day: 20, status: "غائب", notes: "مريض" },
  { lesson: GONE, student: KID._id, dateKey: 20261001, year: 2026, month: 10, day: 1, status: "حاضر", notes: "" },
];

function world() {
  const attendance = {
    // Newest first, like the real model.
    async latestOfStudent(sid) { return ROWS.filter((r) => r.student === String(sid)).sort((a, b) => b.dateKey - a.dateKey).map((r) => ({ ...r })); },
  };
  return load("Student/Student.controller.js", {
    "../../utils/permissions": require("../utils/permissions"),
    "../../utils/studentScope": require("../utils/studentScope"),
    "../../middleware/logger": { logWithSource() {} },
    "../Notification/Notification.controller": {},
    ...auditStub().deps,
    "./Student.model": { StudentModelDef: store([KID]) },
    "../Lesson/Lesson.model": { LessonModelDef: store(LESSONS) },
    "../User/User.model": { UserModelDef: store([ADMIN, GUIDE, HELPER, OTHER]) },
    "../Attendance/Attendance.model": { AttendanceModelDef: attendance },
    "../UploadFile/file": { async handleUpload() { return {}; }, async handleDeleteByUrl() { return {}; } },
  });
}

async function open(user) {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = JSON.parse(JSON.stringify(v)); return this; } };
  await world().getOneS({ actor: actorFor(user), user: { id: user._id }, params: { tz: KID.tz }, query: {}, body: {} }, res);
  assert.equal(res.statusCode, 200);
  return res.body.student;
}
const keys = (s) => s.attendance.map((r) => `${r.dateKey} ${r.lessonName}`);

test("the responsible guide sees his student's attendance in every lesson, newest first", async () => {
  assert.deepEqual(keys(await open(GUIDE)), ["20261020 Other", "20261019 Mine", "20261001 "]);
});

test("an admin sees every row too", async () => {
  assert.deepEqual(keys(await open(ADMIN)), ["20261020 Other", "20261019 Mine", "20261001 "]);
});

test("a row carries the date, the lesson, the status and the notes only", async () => {
  const [row] = (await open(GUIDE)).attendance;
  assert.deepEqual(row, { lesson: id("2"), lessonName: "Other", dateKey: 20261020, year: 2026, month: 10, day: 20, status: "غائب", notes: "مريض" });
});

test("a guide who only teaches the student sees the rows of his own lesson only", async () => {
  assert.deepEqual(keys(await open(OTHER)), ["20261020 Other"]);
});

test("an assistant sees the rows of the lessons he assists in only", async () => {
  assert.deepEqual(keys(await open(HELPER)), ["20261019 Mine"]);
});

test("without attendance.view no attendance is sent", async () => {
  assert.equal((await open(NO_ATTENDANCE)).attendance, undefined);
});

// The sport sign-in card (2026-11-01): its hash never leaves the server.
test("the student page never sends the sign-in card hash or the saved passkeys", async () => {
  const student = await open(ADMIN);
  assert.equal(Object.hasOwn(student, "sportCardHash"), false);
  assert.equal(Object.hasOwn(student, "sportPasskeys"), false);
});
