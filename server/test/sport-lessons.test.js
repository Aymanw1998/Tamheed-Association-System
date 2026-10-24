const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { permissionMiddlewareStub } = require("./helpers/actors");
const { auditStub } = require("./helpers/auditStub");
const { matches } = require("./helpers/memoryModel");
const { overlaps, conflictsInRoom9 } = require("../utils/lessonConflict");

// Football lessons and attendance in the staff sports API: real controller and router, in-memory stores.

function createStore(seed = []) {
  let docs = seed.map((d) => structuredClone(d));
  let next = 1;
  const hexId = () => String(next++).padStart(24, "d");
  return {
    async get(filter = {}) { return { success: true, result: docs.filter((d) => matches(d, filter)).map((d) => structuredClone(d)) }; },
    async create(data) {
      const doc = { _id: hexId(), ...structuredClone(data) };
      docs.push(doc);
      return { success: true, result: structuredClone(doc) };
    },
    async updateExisting(filter, patch) {
      let hit = null;
      docs = docs.map((d) => (!hit && matches(d, filter) ? (hit = { ...d, ...structuredClone(patch) }) : d));
      return { success: true, result: structuredClone(hit) };
    },
    async delete(filter) { docs = docs.filter((d) => !matches(d, filter)); return { success: true }; },
    all: () => docs,
  };
}

// A Date whose "now" is frozen; explicit arguments behave normally.
function frozenDate(iso) {
  const FIXED = new Date(iso).getTime();
  return class FrozenDate extends Date {
    constructor(...args) { if (args.length) super(...args); else super(FIXED); }
    static now() { return FIXED; }
  };
}

function load(file, dependencies, DateImpl = Date) {
  const filename = path.join(__dirname, "../Entities", file);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, Date: DateImpl, Set, Map, Number, String, Array, console: { log() {}, warn() {}, error() {} },
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return module.exports;
}

const res = () => ({ statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });
const hex = (c) => c.repeat(24);

/* ================= fixtures (synthetic) ================= */
// 2026-10-25 is a Sunday (day 1).
const TODAY = "2026-10-25";
const NOW = "2026-10-25T10:00:00.000Z";
const user = (c, tz, extra) => ({ _id: hex(c), tz, firstname: `U${c}`, lastname: `N${c}`, roles: ["مرشد"], ...extra });
const GUIDE = user("1", "900000001");
const MANAGER = user("2", "900000002", { permissionGrants: ["sports.manage"] });
const COACH = user("3", "900000003", { permissionGrants: ["sports.coach"] });
const VIEWER = user("5", "900000005", { permissionGrants: ["sports.view"] });
const sid = (n) => `${"5".repeat(23)}${n}`;
const STUDENTS = [1, 2, 3, 4].map((n) => ({
  _id: sid(n), tz: `80000000${n}`, firstname: `Fa${n}`, lastname: `Ki${n}`, birth_date: "2012-01-01", gender: "ذكر",
}));
const SPORT = hex("a");
const SUNDAY = { day: 1, startMin: 1000, endMin: 1060 };

function world({ regular = [], sportLessons = [], attendance = [] } = {}) {
  const sports = createStore([{ _id: SPORT, name: "كرة القدم", icon: "⚽", stats: [] }]);
  // Players 1, 2 and 3 are football players; student 4 is not.
  const players = createStore([1, 2, 3].map((n) => ({ _id: hex(String(n)), studentId: sid(n), sportId: SPORT, stats: {} })));
  const lessons = createStore(sportLessons);
  const attendanceStore = createStore(attendance);
  const regularStore = createStore(regular);
  const audit = auditStub();
  const controller = load("Sport/Sport.controller.js", {
    crypto: require("node:crypto"),
    "./Sport.model": { SportModelDef: sports },
    "./SportPlayer.model": { SportPlayerModelDef: players },
    "./SportLesson.model": { SportLessonModelDef: lessons },
    "./SportAttendance.model": { SportAttendanceModelDef: attendanceStore },
    "../Student/Student.model": { StudentModelDef: createStore(STUDENTS) },
    "../Lesson/Lesson.model": { LessonModelDef: regularStore },
    "../../middleware/logger": { logWithSource() {} },
    "../../utils/sportCards": require("../utils/sportCards"),
    "../../utils/lessonConflict": require("../utils/lessonConflict"),
    ...audit.deps,
  }, frozenDate(NOW));
  return { routes: loadRoutes(controller), lessons, attendance: attendanceStore };
}

function loadRoutes(controller) {
  const routes = [];
  const uses = [];
  const record = (method) => (routePath, ...handlers) => routes.push({ method, path: routePath, handlers: [...uses, ...handlers] });
  const router = { use: (...h) => uses.push(...h), get: record("get"), post: record("post"), put: record("put"), delete: record("delete") };
  load("Sport/Sport.route.js", {
    express: { Router: () => router },
    "./Sport.controller": controller,
    "../../middleware/authMiddleware": { requireAuth: (req, r, next) => next() },
    "../../middleware/permissionMiddleware": permissionMiddlewareStub(),
  });
  return routes;
}

async function call(ctx, u, method, routePath, extra = {}) {
  const route = ctx.routes.find((r) => r.method === method && r.path === routePath);
  assert.ok(route, `no route ${method} ${routePath}`);
  const r = res();
  const request = {
    user: { id: u._id, tz: u.tz, roles: u.roles, permissionGrants: u.permissionGrants },
    params: {}, query: {}, body: {}, ...extra,
  };
  for (const fn of route.handlers) {
    let proceeded = false;
    await fn(request, r, () => { proceeded = true; });
    if (!proceeded) break;
  }
  return r;
}

const body = (extra = {}) => ({ name: "أشبال الأحد", date: SUNDAY, studentIds: [sid(1), sid(2)], ...extra });
const create = (ctx, extra) => call(ctx, MANAGER, "post", "/lessons", { body: body(extra) });

/* ================= lessons ================= */

test("create then list a football lesson", async () => {
  const ctx = world();
  const made = await create(ctx);
  assert.equal(made.statusCode, 201);
  assert.equal(made.body.lesson.room, "9");
  const list = await call(ctx, VIEWER, "get", "/lessons");
  assert.equal(list.statusCode, 200);
  assert.equal(list.body.lessons.length, 1);
  const lesson = list.body.lessons[0];
  assert.equal(lesson.name, "أشبال الأحد");
  assert.deepEqual(JSON.parse(JSON.stringify(lesson.date)), SUNDAY);
  assert.deepEqual(lesson.players.map((p) => [p.studentId, p.firstname, p.lastname]), [[sid(1), "Fa1", "Ki1"], [sid(2), "Fa2", "Ki2"]]);
  assert.ok(lesson.players.every((p) => p.joinedAt));
});

test("only a manager changes lessons; coaches and viewers read or mark", async () => {
  const ctx = world();
  assert.equal((await call(ctx, COACH, "post", "/lessons", { body: body() })).statusCode, 403);
  assert.equal((await call(ctx, GUIDE, "get", "/lessons")).statusCode, 403);
  assert.equal((await call(ctx, COACH, "get", "/lessons")).statusCode, 200);
  const made = await create(ctx);
  const id = made.body.lesson._id;
  assert.equal((await call(ctx, VIEWER, "put", "/lessons/:id/attendance", { params: { id }, body: { date: TODAY, marks: [] } })).statusCode, 403);
  assert.equal((await call(ctx, COACH, "put", "/lessons/:id/attendance", { params: { id }, body: { date: TODAY, marks: [] } })).statusCode, 200);
  assert.equal((await call(ctx, COACH, "delete", "/lessons/:id", { params: { id } })).statusCode, 403);
});

test("validation: name, times and players", async () => {
  const ctx = world();
  const bad = [
    { name: "  " },
    { date: { day: 1, startMin: 600, endMin: 600 } },
    { date: { day: 1, startMin: 700, endMin: 600 } },
    { date: { day: 1, startMin: -1, endMin: 60 } },
    { date: { day: 1, startMin: 60, endMin: 1441 } },
    { date: { day: 8, startMin: 60, endMin: 120 } },
    { studentIds: "x" },
    { studentIds: [sid(4)] }, // not a player
  ];
  for (const extra of bad) assert.equal((await create(ctx, extra)).statusCode, 400, JSON.stringify(extra));
  assert.equal(ctx.lessons.all().length, 0);
});

test("a regular lesson in room 9 conflicts; room 3 does not", async () => {
  const ctx = world({ regular: [{ _id: hex("1"), name: "درس", room: "9", teacher: "t", date: { day: 1, startMin: 1030, endMin: 1100 } }] });
  const r = await create(ctx);
  assert.equal(r.statusCode, 409);
  assert.equal(r.body.message, "يوجد تعارض");

  const other = world({ regular: [{ _id: hex("1"), name: "درس", room: "3", teacher: "t", date: SUNDAY }] });
  assert.equal((await create(other)).statusCode, 201);
});

test("two overlapping sport lessons conflict, back to back ones do not", async () => {
  const ctx = world();
  assert.equal((await create(ctx)).statusCode, 201);
  assert.equal((await create(ctx, { name: "ثانٍ", date: { day: 1, startMin: 1030, endMin: 1090 } })).statusCode, 409);
  assert.equal((await create(ctx, { name: "ثالث", date: { day: 1, startMin: 1060, endMin: 1120 } })).statusCode, 201);
  assert.equal((await create(ctx, { name: "رابع", date: { day: 2, startMin: 1000, endMin: 1060 } })).statusCode, 201);
});

test("PUT keeps joinedAt of staying players, stamps new ones, and does not conflict with itself", async () => {
  const ctx = world();
  const made = await create(ctx);
  const id = made.body.lesson._id;
  const before = made.body.lesson.players.find((p) => p.studentId === sid(1)).joinedAt;
  const stored = ctx.lessons.all()[0];
  stored.players[0].joinedAt = "2026-01-01T00:00:00.000Z";
  const r = await call(ctx, MANAGER, "put", "/lessons/:id", { params: { id }, body: body({ studentIds: [sid(1), sid(3)], date: { day: 1, startMin: 1010, endMin: 1070 } }) });
  assert.equal(r.statusCode, 200);
  const byId = Object.fromEntries(r.body.lesson.players.map((p) => [p.studentId, p.joinedAt]));
  assert.deepEqual(Object.keys(byId), [sid(1), sid(3)]);
  assert.equal(byId[sid(1)], "2026-01-01T00:00:00.000Z");
  assert.notEqual(before, undefined);
  assert.equal(new Date(byId[sid(3)]).toISOString(), NOW);
  assert.equal((await call(ctx, MANAGER, "put", "/lessons/:id", { params: { id: hex("9") }, body: body() })).statusCode, 404);
});

/* ================= attendance ================= */

async function lessonWorld() {
  const ctx = world();
  const id = (await create(ctx)).body.lesson._id;
  return { ctx, id };
}
const save = (ctx, id, date, marks) => call(ctx, COACH, "put", "/lessons/:id/attendance", { params: { id }, body: { date, marks } });

test("attendance: future date and wrong weekday are 400", async () => {
  const { ctx, id } = await lessonWorld();
  for (const date of ["2026-11-01", "2026-10-19", "2026-10-32", "25-10-2026", ""]) {
    const r = await save(ctx, id, date, [{ studentId: sid(1), status: "حاضر" }]);
    assert.equal(r.statusCode, 400, date);
    assert.equal(r.body.message, "لا يمكن تسجيل الحضور في هذا التاريخ");
  }
  assert.equal(ctx.attendance.all().length, 0);
  assert.equal((await call(ctx, COACH, "get", "/lessons/:id/attendance", { params: { id }, query: { date: "2026-11-01" } })).statusCode, 400);
});

test("attendance: saving twice for a date updates and does not duplicate", async () => {
  const { ctx, id } = await lessonWorld();
  assert.equal((await save(ctx, id, "2026-10-18", [{ studentId: sid(1), status: "حاضر" }, { studentId: sid(2), status: "غائب" }])).statusCode, 200);
  assert.equal((await save(ctx, id, "2026-10-18", [{ studentId: sid(1), status: "متأخر" }])).statusCode, 200);
  assert.equal(ctx.attendance.all().length, 2);
  const r = await call(ctx, VIEWER, "get", "/lessons/:id/attendance", { params: { id }, query: { date: "2026-10-18" } });
  assert.equal(r.body.date, "2026-10-18");
  assert.deepEqual(r.body.players.map((p) => [p.studentId, p.status]), [[sid(1), "متأخر"], [sid(2), "غائب"]]);
});

test("attendance GET defaults to today and shows null for unmarked players", async () => {
  const { ctx, id } = await lessonWorld();
  const r = await call(ctx, VIEWER, "get", "/lessons/:id/attendance", { params: { id } });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.date, TODAY);
  assert.ok(r.body.players.every((p) => p.status === null));
});

test("attendance: non-members and bad statuses are 400, and nothing is written", async () => {
  const { ctx, id } = await lessonWorld();
  assert.equal((await save(ctx, id, TODAY, [{ studentId: sid(3), status: "حاضر" }])).statusCode, 400); // a player, but not in this lesson
  assert.equal((await save(ctx, id, TODAY, [{ studentId: sid(1), status: "حاضر" }, { studentId: sid(4), status: "حاضر" }])).statusCode, 400);
  assert.equal((await save(ctx, id, TODAY, [{ studentId: sid(1), status: "ممتاز" }])).statusCode, 400);
  assert.equal((await save(ctx, id, TODAY, "x")).statusCode, 400);
  assert.equal(ctx.attendance.all().length, 0);
});

test("DELETE removes the lesson and its attendance only", async () => {
  const { ctx, id } = await lessonWorld();
  const other = (await create(ctx, { name: "آخر", date: { day: 1, startMin: 100, endMin: 160 } })).body.lesson._id;
  await save(ctx, id, TODAY, [{ studentId: sid(1), status: "حاضر" }]);
  await save(ctx, other, TODAY, [{ studentId: sid(1), status: "غائب" }]);
  const r = await call(ctx, MANAGER, "delete", "/lessons/:id", { params: { id } });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(ctx.lessons.all().map((l) => l._id), [other]);
  assert.deepEqual(ctx.attendance.all().map((a) => a.sportLessonId), [other]);
  assert.equal((await call(ctx, MANAGER, "delete", "/lessons/:id", { params: { id } })).statusCode, 404);
});

test("GET /attendance/today returns only today's lessons, by start time", async () => {
  const ctx = world();
  await create(ctx, { name: "متأخر", date: { day: 1, startMin: 1100, endMin: 1160 } });
  await create(ctx, { name: "مبكر", date: { day: 1, startMin: 600, endMin: 660 } });
  await create(ctx, { name: "الاثنين", date: { day: 2, startMin: 600, endMin: 660 } });
  const r = await call(ctx, VIEWER, "get", "/attendance/today");
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.date, TODAY);
  assert.deepEqual(r.body.lessons.map((l) => l.name), ["مبكر", "متأخر"]);
  assert.deepEqual(Object.keys(r.body.lessons[0]).sort(), ["_id", "date", "name"]);
});

/* ================= lessonConflict ================= */

test("overlaps: same day and overlapping minutes only", () => {
  const at = (day, startMin, endMin) => ({ date: { day, startMin, endMin } });
  assert.equal(overlaps(at(1, 60, 120), at(1, 90, 150)), true);
  assert.equal(overlaps(at(1, 60, 120), at(1, 120, 180)), false);
  assert.equal(overlaps(at(1, 60, 120), at(2, 60, 120)), false);
  assert.equal(overlaps(at(1, 60, 120), at(1, 0, 600)), true);
  assert.equal(overlaps(at(1, 60, 120), {}), false);
});

test("conflictsInRoom9: room 9, shared staff, sport lessons and ignoreId", () => {
  const date = { day: 1, startMin: 60, endMin: 120 };
  const regular = (extra) => ({ _id: "r1", room: "3", date, ...extra });
  const candidate = { date, room: "9" };
  assert.equal(conflictsInRoom9(candidate, { lessons: [regular({ room: "9" })] }), true);
  assert.equal(conflictsInRoom9(candidate, { lessons: [regular()] }), false);
  assert.equal(conflictsInRoom9(candidate, { lessons: [regular({ room: "9", date: { day: 2, startMin: 60, endMin: 120 } })] }), false);
  assert.equal(conflictsInRoom9(candidate, { sportLessons: [{ _id: "s1", date }] }), true);
  assert.equal(conflictsInRoom9(candidate, { sportLessons: [{ _id: "s1", date }], ignoreId: "s1" }), false);
  assert.equal(conflictsInRoom9(candidate, { lessons: [regular({ room: "9" })], ignoreId: "r1" }), false);
  // A regular candidate in another room: shared teacher or helper conflicts, a sport lesson does not.
  const c3 = { date, room: "3", teacher: "t1", helper: "h1" };
  assert.equal(conflictsInRoom9(c3, { lessons: [regular({ room: "4", teacher: "t1" })] }), true);
  assert.equal(conflictsInRoom9(c3, { lessons: [regular({ room: "4", helper: "h1" })] }), true);
  assert.equal(conflictsInRoom9(c3, { lessons: [regular({ room: "4", teacher: "t2" })] }), false);
  assert.equal(conflictsInRoom9(c3, { sportLessons: [{ _id: "s1", date }] }), false);
  // A regular candidate in room 9 collides with a sport lesson.
  assert.equal(conflictsInRoom9({ date, room: "9", teacher: "t1" }, { sportLessons: [{ _id: "s1", date }] }), true);
  assert.equal(conflictsInRoom9(candidate, {}), false);
});
