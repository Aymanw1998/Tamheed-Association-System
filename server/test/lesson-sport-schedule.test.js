const assert = require("node:assert/strict");
const live = require("./helpers/liveStubs");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { actorFor } = require("./helpers/actors");
const { auditStub } = require("./helpers/auditStub");
const { matches } = require("./helpers/memoryModel");

// Football lessons in the general lesson schedule: read-only listing and room 9 conflicts both ways.

function createStore(seed = []) {
  let docs = seed.map((d) => structuredClone(d));
  let next = 1;
  return {
    async get(filter = {}) { return { success: true, result: docs.filter((d) => matches(d, filter)).map((d) => structuredClone(d)) }; },
    async create(data) {
      const doc = { _id: String(next++).padStart(24, "c"), ...structuredClone(data) };
      docs.push(doc);
      return { success: true, result: structuredClone(doc) };
    },
    async update(filter, patch) {
      let hit = null;
      docs = docs.map((d) => (!hit && matches(d, filter) ? (hit = { ...d, ...structuredClone(patch) }) : d));
      return { success: true, result: structuredClone(hit) };
    },
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
const res = () => ({ statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });

const SPORT_LESSON = {
  _id: "5".repeat(24), sportId: "f".repeat(24), name: "Football", room: "9",
  date: { day: 2, startMin: 600, endMin: 660 },
  players: [{ studentId: "1".repeat(24), joinedAt: "2026-10-01" }, { studentId: "2".repeat(24), joinedAt: "2026-10-02" }],
};

function setup(lessonSeed = [], sportSeed = [SPORT_LESSON]) {
  const lessons = createStore(lessonSeed);
  const sportLessons = createStore(sportSeed);
  const controller = load("Lesson/Lesson.controller.js", {
    "./Lesson.model": { LessonModelDef: lessons },
    "../Sport/SportLesson.model": { SportLessonModelDef: sportLessons },
    "../../utils/lessonConflict": require("../utils/lessonConflict"),
    "../User/User.model": { UserModelDef: createStore() },
    "../../utils/permissions": require("../utils/permissions"),
    "../../middleware/logger": { logWithSource() {} },
    "../Notification/Notification.controller": {},
    "../Student/Student.model": { StudentModelDef: createStore() },
    "../../utils/studentScope": require("../utils/studentScope"),
    "../../utils/attendanceMarks": require("../utils/attendanceMarks"),
    ...auditStub().deps,
  });
  return { controller, lessons };
}

const body = (room, startMin = 630, endMin = 690) => ({ name: "Math", teacher: "t1", room, date: { day: 2, startMin, endMin } });

test("POST in room 9 over a football lesson is refused; room 2 is fine", async () => {
  const { controller } = setup();
  const clash = res();
  await controller.postOne(req({ body: body("9") }), clash);
  assert.equal(clash.statusCode, 409);
  assert.deepEqual(JSON.parse(JSON.stringify(clash.body)), { ok: false, message: "يوجد تعارض" });
  const other = res();
  await controller.postOne(req({ body: body("2") }), other);
  assert.equal(other.statusCode, 201);
  const later = res();
  await controller.postOne(req({ body: { ...body("9", 660, 720), teacher: "t2" } }), later);
  assert.equal(later.statusCode, 201);
});

test("PUT moving a lesson into room 9 at an overlapping time is refused", async () => {
  const { controller, lessons } = setup([{ _id: "6".repeat(24), name: "Math", teacher: "t1", room: "2", date: { day: 2, startMin: 630, endMin: 690 }, list_students: [] }]);
  const r = res();
  await controller.putOne(req({ params: { id: "6".repeat(24) }, body: { room: "9" } }), r);
  assert.equal(r.statusCode, 409);
  assert.equal(lessons.all()[0].room, "2");
  const ok = res();
  await controller.putOne(req({ params: { id: "6".repeat(24) }, body: { name: "Algebra" } }), ok);
  assert.equal(ok.statusCode, 200);
});

test("GET /api/lesson does not include football lessons", async () => {
  const { controller } = setup();
  const r = res();
  await controller.getAll(req(), r);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(r.body.lessons)), []);
});

test("GET /sport-schedule lists football lessons read-only, without players", async () => {
  const { controller } = setup();
  const r = res();
  await controller.getSportSchedule(req(), r);
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(r.body.lessons)), [{
    _id: SPORT_LESSON._id, name: "Football", date: SPORT_LESSON.date, room: "9",
    teacher: null, readOnly: true, kind: "sport", playersCount: 2,
  }]);
  assert.ok(!JSON.stringify(r.body).includes("1".repeat(24)));
});

test("the sport-schedule route sits before /:id and needs lessons.view", () => {
  const src = fs.readFileSync(path.join(__dirname, "../Entities/Lesson/Lesson.route.js"), "utf8");
  const at = src.indexOf("'/sport-schedule'");
  assert.ok(at > 0 && at < src.indexOf("'/:id'"));
  assert.match(src, /router\.get\('\/sport-schedule', requirePermission\('lessons\.view'\), getSportSchedule\)/);
});
