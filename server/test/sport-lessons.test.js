const assert = require("node:assert/strict");
const live = require("./helpers/liveStubs");
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
      if (!Object.hasOwn(dependencies, name) && Object.hasOwn(live.deps, name)) return live.deps[name];
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

function world({ regular = [], sportLessons = [], attendance = [], students = STUDENTS } = {}) {
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
    "../Student/Student.model": { StudentModelDef: createStore(students) },
    "../Lesson/Lesson.model": { LessonModelDef: regularStore },
    "../../middleware/logger": { logWithSource() {} },
    "../../utils/cardPush": { notifyCardChanged: async () => 0 },
    "../../utils/sportCards": require("../utils/sportCards"),
    "../../utils/lessonConflict": require("../utils/lessonConflict"),
    ...audit.deps,
  }, frozenDate(NOW));
  return { routes: loadRoutes(controller), lessons, players, audit, attendance: attendanceStore };
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

test("a lesson with no or blank name gets a generated name; an explicit name is kept", async () => {
  const ctx = world();
  const noName = await create(ctx, { name: undefined, studentIds: [] });
  assert.equal(noName.statusCode, 201);
  assert.equal(noName.body.lesson.name, "كرة القدم · الأحد 16:40");
  const blank = await create(ctx, { name: "   ", date: { day: 7, startMin: 65, endMin: 120 }, studentIds: [] });
  assert.equal(blank.body.lesson.name, "كرة القدم · السبت 01:05");
  const kept = await create(ctx, { name: "أشبال", date: { day: 3, startMin: 600, endMin: 660 }, studentIds: [] });
  assert.equal(kept.body.lesson.name, "أشبال");
  const put = await call(ctx, MANAGER, "put", "/lessons/:id", { params: { id: kept.body.lesson._id }, body: { date: { day: 4, startMin: 17 * 60, endMin: 18 * 60 } } });
  assert.equal(put.statusCode, 200);
  assert.equal(put.body.lesson.name, "أشبال"); // a custom name is kept
});

test("PUT regenerates a generated name when the time changes, and keeps a custom name", async () => {
  const ctx = world();
  const gen = (await create(ctx, { name: undefined, studentIds: [] })).body.lesson;
  assert.equal(gen.nameGenerated, true);
  const custom = (await create(ctx, { name: "كرة القدم · الأحد 09:00", date: { day: 2, startMin: 600, endMin: 660 }, studentIds: [] })).body.lesson;
  assert.equal(custom.nameGenerated, false);
  const put = (id, date) => call(ctx, MANAGER, "put", "/lessons/:id", { params: { id }, body: { date } });
  const a = await put(gen._id, { day: 1, startMin: 17 * 60, endMin: 18 * 60 });
  assert.equal(a.body.lesson.name, "كرة القدم · الأحد 17:00");
  assert.equal(a.body.lesson.nameGenerated, true);
  const b = await put(custom._id, { day: 2, startMin: 700, endMin: 760 });
  assert.equal(b.body.lesson.name, "كرة القدم · الأحد 09:00");
  assert.equal(b.body.lesson.nameGenerated, false);
  const list = await call(ctx, VIEWER, "get", "/lessons");
  assert.equal(JSON.stringify(list.body.lessons.map((l) => l.nameGenerated)), "[true,false]");
});

test("PUT without studentIds keeps the roster", async () => {
  const ctx = world();
  const id = (await create(ctx)).body.lesson._id;
  const r = await call(ctx, MANAGER, "put", "/lessons/:id", { params: { id }, body: { date: { day: 1, startMin: 1010, endMin: 1070 } } });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body.lesson.players.map((p) => p.studentId), [sid(1), sid(2)]);
});

test("validation: name, times and players", async () => {
  const ctx = world();
  const bad = [
    { name: "x".repeat(61) },
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

/* ================= roster ================= */

const addPlayer = (ctx, id, studentId, u = COACH) => call(ctx, u, "post", "/lessons/:id/players", { params: { id }, body: { studentId } });

test("POST /lessons/:id/players makes a non-player a player and adds them once", async () => {
  const ctx = world();
  const id = (await create(ctx)).body.lesson._id;
  const r = await addPlayer(ctx, id, sid(4));
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.ok, true);
  assert.deepEqual(r.body.lesson.players.map((p) => p.studentId), [sid(1), sid(2), sid(4)]);
  assert.equal(new Date(r.body.lesson.players[2].joinedAt).toISOString(), NOW);
  const row = ctx.players.all().find((p) => p.studentId === sid(4));
  assert.equal(row.jerseyNumber, null);
  assert.equal(row.position, "");
  assert.deepEqual(JSON.parse(JSON.stringify(row.stats)), {});
  assert.equal(ctx.audit.find({ module: "sports", action: "create", targetType: "player" }).length, 1);
  const again = await addPlayer(ctx, id, sid(4));
  assert.equal(again.statusCode, 200);
  assert.equal(ctx.lessons.all()[0].players.length, 3);
  assert.equal(ctx.players.all().filter((p) => p.studentId === sid(4)).length, 1);
});

test("adding an existing player keeps their number and position", async () => {
  const ctx = world();
  await ctx.players.updateExisting({ studentId: sid(3) }, { jerseyNumber: 8, position: "حارس" });
  const id = (await create(ctx)).body.lesson._id;
  const r = await addPlayer(ctx, id, sid(3), MANAGER);
  assert.equal(r.statusCode, 200);
  const row = ctx.players.all().find((p) => p.studentId === sid(3));
  assert.equal(row.jerseyNumber, 8);
  assert.equal(row.position, "حارس");
});

test("POST /lessons/:id/players: unknown student 404, unknown lesson 404, viewer 403", async () => {
  const ctx = world();
  const id = (await create(ctx)).body.lesson._id;
  const unknown = await addPlayer(ctx, id, hex("0"));
  assert.equal(unknown.statusCode, 404);
  assert.equal(unknown.body.message, "الطالب غير موجود");
  assert.equal((await addPlayer(ctx, id, "nope")).statusCode, 404);
  assert.equal((await addPlayer(ctx, hex("9"), sid(4))).statusCode, 404);
  assert.equal((await addPlayer(ctx, id, sid(4), VIEWER)).statusCode, 403);
  assert.equal(ctx.players.all().length, 3);
});

test("DELETE /lessons/:id/players/:studentId removes from that lesson only", async () => {
  const ctx = world();
  const a = (await create(ctx)).body.lesson._id;
  const b = (await create(ctx, { name: "آخر", date: { day: 2, startMin: 1000, endMin: 1060 } })).body.lesson._id;
  await call(ctx, COACH, "put", "/lessons/:id/attendance", { params: { id: a }, body: { date: TODAY, marks: [{ studentId: sid(1), status: "حاضر" }] } });
  const del = (id, studentId, u = COACH) => call(ctx, u, "delete", "/lessons/:id/players/:studentId", { params: { id, studentId } });
  const r = await del(a, sid(1));
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body.lesson.players.map((p) => p.studentId), [sid(2)]);
  assert.equal(ctx.lessons.all().find((l) => l._id === b).players.length, 2);
  assert.equal(ctx.attendance.all().length, 1);
  assert.equal(ctx.players.all().some((p) => p.studentId === sid(1)), true);
  assert.equal((await del(a, sid(1))).statusCode, 200); // already gone: no-op
  assert.equal((await del(hex("9"), sid(1))).statusCode, 404);
  assert.equal((await del(b, sid(1), VIEWER)).statusCode, 403);
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

test("lists and attendance skip players whose student no longer exists", async () => {
  const ctx = world({ students: STUDENTS.filter((s) => s._id !== sid(2)) });
  const id = (await create(ctx)).body.lesson._id;
  const list = await call(ctx, VIEWER, "get", "/lessons");
  assert.deepEqual(list.body.lessons[0].players.map((p) => p.studentId), [sid(1)]);
  const att = await call(ctx, VIEWER, "get", "/lessons/:id/attendance", { params: { id } });
  assert.deepEqual(att.body.players.map((p) => p.studentId), [sid(1)]);
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

test("attendance: reports marks replaced by a different user, never the user's own or auto rows", async () => {
  const { ctx, id } = await lessonWorld();
  const as = (u, marks) => call(ctx, u, "put", "/lessons/:id/attendance", { params: { id }, body: { date: TODAY, marks } });
  const first = await as(COACH, [{ studentId: sid(1), status: "حاضر" }]);
  assert.equal(first.statusCode, 200);
  assert.deepEqual([...first.body.overwritten], []);
  assert.equal(ctx.attendance.all()[0].updatedBy, COACH._id);
  assert.deepEqual([...(await as(COACH, [{ studentId: sid(1), status: "غائب" }])).body.overwritten], [], "own row");
  assert.deepEqual([...(await as(MANAGER, [{ studentId: sid(1), status: "غائب" }])).body.overwritten], [], "same status");
  await as(COACH, [{ studentId: sid(1), status: "غائب" }]);
  assert.deepEqual([...(await as(MANAGER, [{ studentId: sid(1), status: "حاضر" }])).body.overwritten], [sid(1)]);
  assert.equal(ctx.attendance.all()[0].updatedBy, MANAGER._id);
  // A row with no updatedBy (legacy/automatic) is never reported.
  await ctx.attendance.create({ sportLessonId: id, studentId: sid(2), date: TODAY, status: "غائب" });
  assert.deepEqual([...(await as(COACH, [{ studentId: sid(2), status: "حاضر" }])).body.overwritten], []);
  await as(COACH, [{ studentId: sid(1), status: "حاضر" }]);
  assert.equal(ctx.attendance.all().filter((r) => r.studentId === sid(1)).length, 1);
});

/* ================= locks, versions and live announcements ================= */

test("sport attendance announces sportAttendance and tells exactly the marked students", async () => {
  const ctx = world();
  const id = (await create(ctx)).body.lesson._id;
  live.changes.length = 0;
  live.students.length = 0;
  const r = await save(ctx, id, TODAY, [{ studentId: sid(1), status: "حاضر" }, { studentId: sid(2), status: "غائب" }]);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(live.changes, [["sportAttendance", `${id}:${TODAY}`]]);
  assert.deepEqual(live.students, [[[sid(1), sid(2)], "me"]]);

  live.changes.length = 0;
  live.students.length = 0;
  assert.equal((await save(ctx, id, "2026-10-26", [])).statusCode, 400);
  assert.deepEqual(live.changes, []);
  assert.deepEqual(live.students, []);
});

test("sport lesson create, edit, roster and delete announce sportLesson and tell its players", async () => {
  const ctx = world();
  live.changes.length = 0;
  live.students.length = 0;
  const made = await create(ctx);
  const id = made.body.lesson._id;
  assert.deepEqual(live.changes, [["sportLesson", id]]);
  assert.deepEqual(live.students, [[[sid(1), sid(2)], "me"]]);

  live.changes.length = 0;
  live.students.length = 0;
  await call(ctx, COACH, "post", "/lessons/:id/players", { params: { id }, body: { studentId: sid(3) } });
  assert.deepEqual(live.changes, [["sportLesson", id]]);
  assert.deepEqual([...live.students[0][0]].sort(), [sid(1), sid(2), sid(3)]);

  live.changes.length = 0;
  live.students.length = 0;
  await call(ctx, COACH, "delete", "/lessons/:id/players/:studentId", { params: { id, studentId: sid(3) } });
  assert.deepEqual(live.changes, [["sportLesson", id]]);
  assert.ok(live.students[0][0].includes(sid(3)), "the removed student is told too");

  live.changes.length = 0;
  live.students.length = 0;
  await call(ctx, MANAGER, "delete", "/lessons/:id", { params: { id } });
  assert.deepEqual(live.changes, [["sportLesson", id]]);
  assert.deepEqual(live.students, [[[sid(1), sid(2)], "me"]]);
});

test("a sport lesson form saved on top of a newer version is 409 STALE and changes nothing", async () => {
  const ctx = world();
  const id = (await create(ctx)).body.lesson._id;
  const stored = ctx.lessons.all().find((l) => l._id === id);
  assert.ok(Number.isFinite(Date.parse(stored.updatedAt)));
  live.changes.length = 0;
  live.students.length = 0;
  const stale = await call(ctx, MANAGER, "put", "/lessons/:id", { params: { id }, body: { ...body({ name: "جديد" }), baseVersion: "2000-01-01T00:00:00.000Z" } });
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.body.code, "STALE");
  assert.equal(stale.body.current.name, "أشبال الأحد");
  assert.deepEqual(live.changes, []);
  assert.deepEqual(live.students, []);
  const fresh = await call(ctx, MANAGER, "put", "/lessons/:id", { params: { id }, body: { ...body({ name: "جديد" }), baseVersion: new Date(stored.updatedAt).toISOString() } });
  assert.equal(fresh.statusCode, 200);
});

test("saving two players onto the same lesson at once keeps both on its roster", async () => {
  const L = hex("e");
  const ctx = world({ sportLessons: [{ _id: L, sportId: SPORT, name: "Sun", date: SUNDAY, room: "9", players: [], updatedAt: new Date("2026-10-20T10:00:00.000Z") }] });
  const put = (n) => call(ctx, COACH, "put", "/players/:studentId", { params: { studentId: sid(n) }, body: { lessonIds: [L] } });
  const [a, b] = await Promise.all([put(1), put(2)]);
  assert.equal(a.statusCode, 200);
  assert.equal(b.statusCode, 200);
  const roster = ctx.lessons.all().find((l) => l._id === L).players.map((p) => p.studentId).sort();
  assert.deepEqual(roster, [sid(1), sid(2)]);
});

test("a player save that would change a lesson another tab holds is 423 and writes nothing", async () => {
  const L = hex("e");
  const ctx = world({ sportLessons: [{ _id: L, sportId: SPORT, name: "Sun", date: SUNDAY, room: "9", players: [], updatedAt: new Date("2026-10-20T10:00:00.000Z") }] });
  live.holders.set(`sportLesson:${L}`, { clientId: "other-tab", name: "Ma Nager", tz: "900000002" });
  try {
    const before = structuredClone([ctx.lessons.all(), ctx.players.all()]);
    const out = await call(ctx, COACH, "put", "/players/:studentId", { params: { studentId: sid(1) }, body: { jerseyNumber: 7, lessonIds: [L] } });
    assert.equal(out.statusCode, 423);
    assert.equal(out.body.code, "LOCKED");
    assert.equal(out.body.holder.name, "Ma Nager");
    assert.deepEqual([ctx.lessons.all(), ctx.players.all()], before);
    // A save that leaves that lesson's roster as it is still goes through.
    const other = await call(ctx, COACH, "put", "/players/:studentId", { params: { studentId: sid(1) }, body: { jerseyNumber: 7, lessonIds: [] } });
    assert.equal(other.statusCode, 200);
    // Deleting a player who is on a held lesson is refused too.
    ctx.lessons.all()[0].players = [{ studentId: sid(2), joinedAt: new Date() }];
    const del = await call(ctx, COACH, "delete", "/players/:studentId", { params: { studentId: sid(2) } });
    assert.equal(del.statusCode, 423);
    assert.equal(ctx.players.all().some((p) => p.studentId === sid(2)), true);
  } finally {
    live.holders.clear();
  }
});

test("three players saved onto one lesson at once, with a frozen clock, all stay on the roster", async () => {
  const L = hex("e");
  // The world's clock is frozen at NOW: every write in the controller gets the same time.
  const ctx = world({ sportLessons: [{ _id: L, sportId: SPORT, name: "Sun", date: SUNDAY, room: "9", players: [], updatedAt: new Date(NOW) }] });
  const put = (n) => call(ctx, COACH, "put", "/players/:studentId", { params: { studentId: sid(n) }, body: { lessonIds: [L] } });
  const out = await Promise.all([put(1), put(2), put(3)]);
  assert.deepEqual(out.map((r) => r.statusCode), [200, 200, 200]);
  const roster = ctx.lessons.all().find((l) => l._id === L).players.map((p) => p.studentId).sort();
  assert.deepEqual(roster, [sid(1), sid(2), sid(3)]);
});

test("a lesson form save after a roster change keeps the version moving forward (a delayed save on an old version is 409)", async () => {
  const ctx = world();
  const created = (await create(ctx)).body.lesson;
  const id = created._id;
  const stored = () => new Date(ctx.lessons.all().find((l) => l._id === id).updatedAt).getTime();
  const v0 = stored();
  // The clock is frozen: the roster change stamps ahead of it, the form save must not step back.
  await addPlayer(ctx, id, sid(3));
  const v1 = stored();
  assert.ok(v1 > v0);
  const fresh = await call(ctx, MANAGER, "put", "/lessons/:id", { params: { id }, body: body({ studentIds: [sid(1), sid(2), sid(3)], baseVersion: new Date(v1).toISOString() }) });
  assert.equal(fresh.statusCode, 200);
  assert.ok(stored() > v1, "never back to an earlier version");
  const late = await call(ctx, MANAGER, "put", "/lessons/:id", { params: { id }, body: body({ studentIds: [sid(1)], baseVersion: new Date(v0).toISOString() }) });
  assert.equal(late.statusCode, 409);
  assert.ok(ctx.lessons.all().find((l) => l._id === id).players.some((p) => p.studentId === sid(3)), "the added player stays");
});
