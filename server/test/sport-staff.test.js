const assert = require("node:assert/strict");
const live = require("./helpers/liveStubs");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { permissionMiddlewareStub } = require("./helpers/actors");
const { auditStub } = require("./helpers/auditStub");
const { matches } = require("./helpers/memoryModel");

// The staff sports API (/api/sports): real controller and router, in-memory stores.

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

function load(file, dependencies) {
  const filename = path.join(__dirname, "../Entities", file);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, Date, Set, Map, Number, String, Array, console: { log() {}, warn() {}, error() {} },
    require(name) {
      if (!Object.hasOwn(dependencies, name) && Object.hasOwn(live.deps, name)) return live.deps[name];
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return module.exports;
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const res = () => ({ statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });
const hex = (c) => c.repeat(24);

/* ================= fixtures (synthetic) ================= */
const user = (c, tz, extra) => ({ _id: hex(c), tz, firstname: `U${c}`, lastname: `N${c}`, roles: ["مرشد"], ...extra });
const GUIDE = user("1", "900000001");
const MANAGER = user("2", "900000002", { permissionGrants: ["sports.manage"] });
const COACH = user("3", "900000003", { permissionGrants: ["sports.coach"] });
const VIEWER = user("5", "900000005", { permissionGrants: ["sports.view"] });
const sid = (n) => `${"5".repeat(23)}${n}`;
const STUDENTS = [1, 2, 3, 4].map((n) => ({
  _id: sid(n), tz: `80000000${n}`, firstname: `Fa${n}`, lastname: `Ki${n}`, birth_date: "2012-01-01",
  gender: n === 3 ? "أنثى" : "ذكر", layer: n === 2 ? "ب" : "أ", school: n === 4 ? "مدرسة ب" : "مدرسة أ",
  email: `s${n}@example.com`, photo: n === 1 ? "https://example.com/p1.jpg" : "", health_status: "secret", father_phone: "0500000000", notes: "secret",
  main_teacher: n === 1 ? hex("9") : null,
}));
const SPORT = hex("a");
const LESSON_A = hex("c");
const LESSON_B = hex("e");
const STAT = "s_00000001";
const STAT2 = "s_00000002";

function world({ players, withSport = true } = {}) {
  const sports = createStore(withSport ? [
    { _id: SPORT, name: "كرة القدم", icon: "⚽", stats: [{ key: STAT, label: "أهداف" }, { key: STAT2, label: "تمريرات" }] },
  ] : []);
  const playerStore = createStore(players || [
    { _id: hex("f"), studentId: sid(1), sportId: SPORT, jerseyNumber: 7, position: "مهاجم", stats: { [STAT]: 3, [STAT2]: 5 } },
    { _id: hex("9"), studentId: sid(2), sportId: SPORT, jerseyNumber: null, position: "" },
  ]);
  // Stand-ins for the two atomic model helpers (api.increment / api.unsetMany in production).
  playerStore.bumpStat = async (id, key, delta) => {
    const doc = playerStore.all().find((d) => d._id === id);
    const next = Math.max(0, (Number(doc.stats?.[key]) || 0) + delta);
    await playerStore.updateExisting({ _id: id }, { stats: { ...(doc.stats || {}), [key]: next } });
    return next;
  };
  playerStore.unsetStats = async (keys) => {
    for (const d of playerStore.all()) {
      if (!d.stats) continue;
      const stats = { ...d.stats };
      for (const k of keys) delete stats[k];
      await playerStore.updateExisting({ _id: d._id }, { stats });
    }
    return { success: true };
  };
  const lessons = createStore([
    { _id: LESSON_A, sportId: SPORT, name: "أشبال الأحد", date: { day: 1, startMin: 1000, endMin: 1060 }, room: "9",
      players: [{ studentId: sid(1), joinedAt: "2026-01-01T00:00:00.000Z" }] },
    { _id: LESSON_B, sportId: SPORT, name: "ناشئو الثلاثاء", date: { day: 3, startMin: 1000, endMin: 1060 }, room: "9",
      players: [{ studentId: sid(2), joinedAt: "2026-01-01T00:00:00.000Z" }] },
  ]);
  const attendance = createStore([
    { _id: hex("7"), sportLessonId: LESSON_A, studentId: sid(1), date: "2026-02-01", status: "حاضر" },
    { _id: hex("8"), sportLessonId: LESSON_B, studentId: sid(2), date: "2026-02-03", status: "غائب" },
  ]);
  const students = createStore(STUDENTS);
  const audit = auditStub();
  const controller = load("Sport/Sport.controller.js", {
    crypto: require("node:crypto"),
    "./Sport.model": { SportModelDef: sports },
    "./SportPlayer.model": { SportPlayerModelDef: playerStore },
    "./SportLesson.model": { SportLessonModelDef: lessons },
    "./SportAttendance.model": { SportAttendanceModelDef: attendance },
    "../Student/Student.model": { StudentModelDef: students },
    "../User/User.model": { UserModelDef: createStore([{ _id: hex("9"), firstname: "إبراهيم", lastname: "الوهباني" }]) },
    "../../middleware/logger": { logWithSource() {} },
    "../../utils/cardPush": { notifyCardChanged: async () => 0 },
    "../Lesson/Lesson.model": { LessonModelDef: createStore([]) },
    "../../utils/sportCards": require("../utils/sportCards"),
    "../../utils/lessonConflict": require("../utils/lessonConflict"),
    ...audit.deps,
  });
  return { controller, routes: loadRoutes(controller), sports, students, players: playerStore, lessons, attendance, audit };
}

// The real router, recording each route's chain (router.use first).
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

const as = (u, extra = {}) => ({
  user: { id: u._id, tz: u.tz, roles: u.roles, permissionGrants: u.permissionGrants },
  params: {}, query: {}, body: {}, ...extra,
});

// Runs the route registered as `method path` through its guards, then the handler.
async function call(ctx, u, method, routePath, extra = {}) {
  const route = ctx.routes.find((r) => r.method === method && r.path === routePath);
  assert.ok(route, `no route ${method} ${routePath}`);
  const r = res();
  const request = as(u, extra);
  for (const fn of route.handlers) {
    let proceeded = false;
    await fn(request, r, () => { proceeded = true; });
    if (!proceeded) break;
  }
  return r;
}

test("the route table is exactly the football staff API", () => {
  const ctx = world();
  assert.deepEqual(ctx.routes.map((r) => `${r.method.toUpperCase()} ${r.path}`), [
    "GET /", "PUT /stats", "GET /players", "GET /students/search",
    "GET /players/:studentId/photo", "PUT /players/:studentId", "DELETE /players/:studentId", "POST /players/:studentId/stats",
    "GET /lessons", "POST /lessons", "PUT /lessons/:id", "DELETE /lessons/:id",
    "POST /lessons/:id/players", "DELETE /lessons/:id/players/:studentId",
    "GET /lessons/:id/attendance", "PUT /lessons/:id/attendance",
    "GET /notices", "POST /notices", "DELETE /notices/:id", "GET /attendance/today",
  ]);
});

test("a guide without sports keys gets 403 on every route", async () => {
  const ctx = world();
  for (const route of ctx.routes) {
    const r = await call(ctx, GUIDE, route.method, route.path, { params: { studentId: sid(1) } });
    assert.equal(r.statusCode, 403, `${route.method} ${route.path}`);
  }
});

test("GET / creates football once and returns it", async () => {
  const ctx = world({ withSport: false });
  const a = await call(ctx, VIEWER, "get", "/");
  const b = await call(ctx, VIEWER, "get", "/");
  assert.equal(a.statusCode, 200);
  assert.equal(a.body.sport.name, "كرة القدم");
  assert.equal(a.body.sport.icon, "⚽");
  assert.deepEqual(plain(a.body.sport.stats), []);
  assert.equal(ctx.sports.all().length, 1);
  assert.equal(b.body.sport._id, a.body.sport._id);
});

test("concurrent first calls still create one sport", async () => {
  const ctx = world({ withSport: false });
  await Promise.all([call(ctx, VIEWER, "get", "/"), call(ctx, VIEWER, "get", "/players")]);
  assert.equal(ctx.sports.all().length, 1);
});

test("PUT /stats refuses five stats or a blank label, and only a manager may call it", async () => {
  const ctx = world();
  const five = ["a", "b", "c", "d", "e"].map((label) => ({ label }));
  assert.equal((await call(ctx, MANAGER, "put", "/stats", { body: { stats: five } })).statusCode, 400);
  assert.equal((await call(ctx, MANAGER, "put", "/stats", { body: { stats: [{ label: "  " }] } })).statusCode, 400);
  assert.equal((await call(ctx, MANAGER, "put", "/stats", { body: { stats: "x" } })).statusCode, 400);
  assert.equal((await call(ctx, COACH, "put", "/stats", { body: { stats: [] } })).statusCode, 403);
  assert.equal(plain(ctx.sports.all()[0].stats).length, 2);
});

test("renaming keeps a key, new and forged keys get fresh s_<hex> keys", async () => {
  const ctx = world();
  const r = await call(ctx, MANAGER, "put", "/stats", {
    body: { stats: [{ key: STAT, label: "تسجيل" }, { label: "تصديات" }, { key: "s_forged00", label: "مزوّر" }] },
  });
  assert.equal(r.statusCode, 200);
  const stats = plain(r.body.sport.stats);
  assert.deepEqual(stats[0], { key: STAT, label: "تسجيل" });
  assert.match(stats[1].key, /^s_[0-9a-f]{8}$/);
  assert.match(stats[2].key, /^s_[0-9a-f]{8}$/);
  assert.notEqual(stats[1].key, stats[2].key);
  assert.notEqual(stats[2].key, "s_forged00");
  assert.equal(ctx.audit.find({ module: "sports", action: "update", targetType: "sport" }).length, 1);
});

test("removing a stat key unsets it from every player and GET /players no longer shows it", async () => {
  const ctx = world();
  const r = await call(ctx, MANAGER, "put", "/stats", { body: { stats: [{ key: STAT, label: "أهداف" }] } });
  assert.equal(r.statusCode, 200);
  assert.equal(STAT2 in ctx.players.all()[0].stats, false);
  assert.equal(ctx.players.all()[0].stats[STAT], 3);
  const list = await call(ctx, VIEWER, "get", "/players");
  const p = list.body.players.find((x) => x.studentId === sid(1));
  assert.deepEqual(plain(p.values), { [STAT]: 3 });
});

test("GET /players lists football players with lessons, values and attendance, and no private fields", async () => {
  const ctx = world();
  const r = await call(ctx, VIEWER, "get", "/players");
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.players.length, 2);
  const expected = ["age", "attendance", "birthDate", "firstname", "gender", "jerseyNumber", "lastname", "layer", "lessons", "mentor", "photo", "photoCutout", "position", "school", "studentId", "tz", "values"];
  for (const p of r.body.players) assert.deepEqual(Object.keys(p).sort(), expected);
  const one = r.body.players.find((p) => p.studentId === sid(1));
  assert.deepEqual(plain(one.lessons), [{ _id: LESSON_A, name: "أشبال الأحد", day: 1, startMin: 1000 }]);
  assert.deepEqual(plain(one.values), { [STAT]: 3, [STAT2]: 5 });
  assert.equal(one.attendance.present, 1);
  assert.equal(one.attendance.rate, 100);
  assert.equal(one.jerseyNumber, 7);
  assert.equal(typeof one.age, "number");
  const two = r.body.players.find((p) => p.studentId === sid(2));
  assert.deepEqual(plain(two.values), { [STAT]: 0, [STAT2]: 0 });
  assert.equal(two.attendance.absent, 1);
  const text = JSON.stringify(r.body);
  assert.equal(text.includes("secret"), false);
  assert.equal(one.tz, "800000001");
  assert.equal(one.photo, "https://example.com/p1.jpg");
  assert.equal(two.photo, "");
  assert.equal(one.birthDate, "2012-01-01");
});

test("a sports.coach-only actor reads GET /players", async () => {
  const ctx = world();
  assert.equal((await call(ctx, COACH, "get", "/players")).statusCode, 200);
});

test("stat buttons: +1, -1, floor at 0, unknown key and bad delta give 400", async () => {
  const ctx = world();
  const params = { studentId: sid(1) };
  const post = (p, body) => call(ctx, COACH, "post", "/players/:studentId/stats", { params: p, body });
  const up = await post(params, { key: STAT, delta: 1 });
  assert.equal(up.statusCode, 200);
  assert.equal(up.body.value, 4);
  assert.equal((await post(params, { key: STAT, delta: -1 })).body.value, 3);
  const floor = await post({ studentId: sid(2) }, { key: STAT, delta: -1 });
  assert.equal(floor.statusCode, 200);
  assert.equal(floor.body.value, 0);
  assert.equal((await post(params, { key: "s_nope0000", delta: 1 })).statusCode, 400);
  assert.equal((await post(params, { key: STAT, delta: 5 })).statusCode, 400);
  assert.equal((await post({ studentId: sid(3) }, { key: STAT, delta: 1 })).statusCode, 404);
});

test("a sports.view-only actor gets 403 on the stat buttons", async () => {
  const ctx = world();
  const r = await call(ctx, VIEWER, "post", "/players/:studentId/stats", { params: { studentId: sid(1) }, body: { key: STAT, delta: 1 } });
  assert.equal(r.statusCode, 403);
  assert.equal(ctx.players.all()[0].stats[STAT], 3);
});

test("student search: empty q returns everyone, ordered by name, with tz and photo", async () => {
  const ctx = world();
  const search = (q) => call(ctx, COACH, "get", "/students/search", { query: q === undefined ? {} : { q } });
  for (const r of [await search(""), await search(undefined), await search("  ")]) {
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.body.students.map((s) => s._id), [sid(1), sid(2), sid(3), sid(4)]);
  }
  const all = (await search("")).body.students;
  assert.deepEqual(Object.keys(all[0]).sort(), ["_id", "age", "firstname", "gender", "isPlayer", "lastname", "layer", "photo", "school", "tz"]);
  assert.equal(all[0].tz, "800000001");
  assert.equal(all[0].photo, "https://example.com/p1.jpg");
  assert.equal(all[1].photo, "");
  assert.equal(all[0].isPlayer, true);
  assert.equal(all[2].isPlayer, false);
  assert.equal(JSON.stringify(all).includes("secret"), false);
});

test("student search is not capped at 20", async () => {
  const ctx = world();
  for (let i = 0; i < 30; i += 1) {
    await ctx.students.create({ tz: `70000${i}`, firstname: `Bulk${i}`, lastname: "X", birth_date: "2012-01-01" });
  }
  assert.equal((await call(ctx, COACH, "get", "/students/search", { query: {} })).body.students.length, 34);
});

test("student search matches a tz fragment or a name", async () => {
  const ctx = world();
  const search = (q) => call(ctx, COACH, "get", "/students/search", { query: { q } });
  assert.deepEqual((await search("800000003")).body.students.map((s) => s._id), [sid(3)]);
  assert.deepEqual((await search("00003")).body.students.map((s) => s._id), [sid(3)]);
  assert.equal((await search("80000000")).body.students.length, 4);
  assert.deepEqual((await search("fa3")).body.students.map((s) => s._id), [sid(3)]);
  assert.deepEqual((await search("KI2")).body.students.map((s) => s._id), [sid(2)]);
  assert.deepEqual((await search("fa1 ki1")).body.students.map((s) => s._id), [sid(1)]);
  assert.equal((await search("fa1")).body.students[0].isPlayer, true);
  assert.deepEqual(plain((await search("zzz")).body.students), []);
  assert.equal((await call(ctx, VIEWER, "get", "/students/search", { query: { q: "F1" } })).statusCode, 403);
});

test("student search filters narrow by layer, gender and school", async () => {
  const ctx = world();
  const ids = async (extra) => (await call(ctx, COACH, "get", "/students/search", { query: { q: "fa", ...extra } })).body.students.map((s) => s._id);
  assert.equal((await ids()).length, 4);
  assert.deepEqual(await ids({ layer: "ب" }), [sid(2)]);
  assert.deepEqual(await ids({ gender: "أنثى" }), [sid(3)]);
  assert.deepEqual(await ids({ school: "مدرسة ب" }), [sid(4)]);
  assert.deepEqual(await ids({ layer: "أ", gender: "ذكر" }), [sid(1), sid(4)]);
  const empty = (await call(ctx, COACH, "get", "/students/search", { query: { layer: "ب" } })).body.students.map((s) => s._id);
  assert.deepEqual(empty, [sid(2)]); // filters also narrow an empty search
});

test("PUT /players/:studentId validates jersey, position, lessons and student", async () => {
  const ctx = world();
  const put = (studentId, body) => call(ctx, COACH, "put", "/players/:studentId", { params: { studentId }, body });
  assert.equal((await put(sid(3), { jerseyNumber: 100 })).statusCode, 400);
  assert.equal((await put(sid(3), { jerseyNumber: 0 })).statusCode, 400);
  assert.equal((await put(sid(3), { jerseyNumber: 1.5 })).statusCode, 400);
  assert.equal((await put(sid(3), { position: "x".repeat(31) })).statusCode, 400);
  assert.equal((await put(sid(3), { lessonIds: "x" })).statusCode, 400);
  assert.equal((await put(sid(3), { lessonIds: [hex("0")] })).statusCode, 400);
  assert.equal((await put(hex("0"), { jerseyNumber: 5 })).statusCode, 404);
  assert.equal((await call(ctx, VIEWER, "put", "/players/:studentId", { params: { studentId: sid(3) }, body: {} })).statusCode, 403);
  assert.equal(ctx.players.all().length, 2);
});

test("saving a player joins listed lessons with joinedAt, keeps joinedAt on re-save, and leaves unlisted lessons", async () => {
  const ctx = world();
  const put = (body) => call(ctx, COACH, "put", "/players/:studentId", { params: { studentId: sid(3) }, body });
  const first = await put({ jerseyNumber: "10", position: " حارس ", lessonIds: [LESSON_A] });
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.player.jerseyNumber, 10);
  assert.equal(first.body.player.position, "حارس");
  const joined = plain(ctx.lessons.all()[0].players).find((p) => p.studentId === sid(3));
  assert.ok(joined.joinedAt);
  assert.equal(ctx.audit.find({ module: "sports", action: "create", targetType: "player" }).length, 1);
  await put({ jerseyNumber: 11, lessonIds: [LESSON_A] });
  const again = plain(ctx.lessons.all()[0].players).filter((p) => p.studentId === sid(3));
  assert.equal(again.length, 1);
  assert.equal(again[0].joinedAt, joined.joinedAt);
  assert.equal(ctx.players.all().filter((p) => p.studentId === sid(3)).length, 1);
  assert.ok(plain(ctx.lessons.all()[0].players).some((p) => p.studentId === sid(1) && p.joinedAt === "2026-01-01T00:00:00.000Z"));
  await put({ jerseyNumber: null, lessonIds: [LESSON_B] });
  assert.equal(plain(ctx.lessons.all()[0].players).some((p) => p.studentId === sid(3)), false);
  assert.equal(plain(ctx.lessons.all()[1].players).some((p) => p.studentId === sid(3)), true);
  assert.equal(ctx.players.all().find((p) => p.studentId === sid(3)).jerseyNumber, null);
});

test("re-saving an existing player keeps their stats", async () => {
  const ctx = world();
  await call(ctx, COACH, "put", "/players/:studentId", { params: { studentId: sid(1) }, body: { jerseyNumber: 9, lessonIds: [LESSON_A] } });
  assert.equal(ctx.players.all()[0].stats[STAT], 3);
  assert.equal(ctx.players.all()[0].jerseyNumber, 9);
});

test("DELETE removes the player from every lesson and keeps attendance rows", async () => {
  const ctx = world();
  const r = await call(ctx, COACH, "delete", "/players/:studentId", { params: { studentId: sid(1) } });
  assert.equal(r.statusCode, 200);
  assert.equal(ctx.players.all().some((p) => p.studentId === sid(1)), false);
  assert.equal(plain(ctx.lessons.all()[0].players).some((p) => p.studentId === sid(1)), false);
  assert.equal(ctx.attendance.all().length, 2);
  assert.equal(ctx.audit.find({ module: "sports", action: "delete", targetType: "player" }).length, 1);
  assert.equal((await call(ctx, COACH, "delete", "/players/:studentId", { params: { studentId: sid(1) } })).statusCode, 404);
});

test("player writes announce the change and tell exactly that student's sport screen", async () => {
  const ctx = world();
  live.changes.length = 0;
  live.students.length = 0;
  const bump = await call(ctx, COACH, "post", "/players/:studentId/stats", { params: { studentId: sid(1) }, body: { key: STAT, delta: 1 } });
  assert.equal(bump.statusCode, 200);
  assert.deepEqual(live.changes, [["player", sid(1)]]);
  assert.deepEqual(live.students, [[[sid(1)], "me"]]);

  live.changes.length = 0;
  live.students.length = 0;
  const saved = await call(ctx, COACH, "put", "/players/:studentId", { params: { studentId: sid(3) }, body: { jerseyNumber: 9, position: "x", lessonIds: [LESSON_B] } });
  assert.equal(saved.statusCode, 200);
  assert.deepEqual(live.changes, [["player", sid(3)], ["sportLesson", LESSON_B]]);
  assert.deepEqual(live.students, [[[sid(3)], "me"]]);

  live.changes.length = 0;
  live.students.length = 0;
  const removed = await call(ctx, COACH, "delete", "/players/:studentId", { params: { studentId: sid(3) } });
  assert.equal(removed.statusCode, 200);
  assert.deepEqual(live.changes, [["player", sid(3)], ["sportLesson", LESSON_B]]);
  assert.deepEqual(live.students, [[[sid(3)], "me"]]);

  live.changes.length = 0;
  live.students.length = 0;
  assert.equal((await call(ctx, COACH, "post", "/players/:studentId/stats", { params: { studentId: sid(1) }, body: { key: STAT, delta: 5 } })).statusCode, 400);
  assert.deepEqual(live.changes, []);
  assert.deepEqual(live.students, []);
});

test("changing the sport's stats announces `sport` and tells every player", async () => {
  const ctx = world();
  live.changes.length = 0;
  live.students.length = 0;
  const r = await call(ctx, MANAGER, "put", "/stats", { body: { stats: [{ key: STAT, label: "أهداف" }] } });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(live.changes, [["sport", SPORT]]);
  assert.deepEqual(live.students.map(([ids, type]) => [[...ids].sort(), type]), [[[sid(1), sid(2)], "me"]]);
});

test("the football row is read once and kept; saving the stats drops the kept copy at once", async () => {
  const ctx = world();
  let reads = 0;
  const get = ctx.sports.get.bind(ctx.sports);
  ctx.sports.get = async (...args) => { reads += 1; return get(...args); };
  await call(ctx, VIEWER, "get", "/");
  await call(ctx, VIEWER, "get", "/players");
  await call(ctx, VIEWER, "get", "/lessons");
  assert.equal(reads, 1, "three requests, one read of the sport");
  const saved = await call(ctx, MANAGER, "put", "/stats", { body: { stats: [{ label: "أهداف" }] } });
  assert.equal(saved.statusCode, 200);
  assert.equal(reads, 2, "the save reads the stored row fresh");
  const after = await call(ctx, VIEWER, "get", "/");
  assert.deepEqual(after.body.sport.stats.map((s) => s.label), ["أهداف"], "the new stats show at once");
  assert.equal(reads, 3, "the read after a save takes the stored row");
  await call(ctx, VIEWER, "get", "/");
  assert.equal(reads, 3, "and keeps it again");
  // A caller changing what it got never changes the kept copy.
  after.body.sport.stats.push({ key: "x", label: "x" });
  assert.equal((await call(ctx, VIEWER, "get", "/")).body.sport.stats.length, 1);
});

test("a stat added elsewhere (another process) is known to the next save: its key and values stay", async () => {
  const ctx = world();
  await call(ctx, VIEWER, "get", "/"); // the row is now kept in memory, without the new stat
  const sport = ctx.sports.all()[0];
  sport.stats = [...(sport.stats || []), { key: "s_ext", label: "Ext" }]; // written by another process
  const saved = await call(ctx, MANAGER, "put", "/stats", { body: { stats: [{ key: "s_ext", label: "Renamed" }] } });
  assert.equal(saved.statusCode, 200);
  assert.deepEqual(saved.body.sport.stats, [{ key: "s_ext", label: "Renamed" }], "same key, so player values keep showing");
});

test("a read that was on its way during a save never replaces the saved copy", async () => {
  const ctx = world();
  const get = ctx.sports.get.bind(ctx.sports);
  let hold = null;
  // The first read is held until the save has finished.
  ctx.sports.get = async (...args) => {
    const answer = await get(...args);
    if (!hold) { hold = true; await new Promise((r) => setTimeout(r, 30)); }
    return answer;
  };
  const slowRead = call(ctx, VIEWER, "get", "/"); // reads the old row, then waits
  await new Promise((r) => setTimeout(r, 5));
  const saved = await call(ctx, MANAGER, "put", "/stats", { body: { stats: [{ label: "جديد" }] } });
  assert.equal(saved.statusCode, 200);
  await slowRead;
  const after = await call(ctx, VIEWER, "get", "/");
  assert.deepEqual(after.body.sport.stats.map((s) => s.label), ["جديد"]);
});

test("two saves at once: whichever answers last, the next read shows what is stored", async () => {
  const ctx = world();
  const update = ctx.sports.updateExisting.bind(ctx.sports);
  let first = true;
  // The first save is written first but answers last.
  ctx.sports.updateExisting = async (...args) => {
    const answer = await update(...args);
    if (first) { first = false; await new Promise((r) => setTimeout(r, 30)); }
    return answer;
  };
  const a = call(ctx, MANAGER, "put", "/stats", { body: { stats: [{ label: "A" }] } });
  await new Promise((r) => setTimeout(r, 5));
  const b = await call(ctx, MANAGER, "put", "/stats", { body: { stats: [{ label: "B" }] } });
  await a;
  assert.equal(b.statusCode, 200);
  const stored = ctx.sports.all()[0].stats.map((s) => s.label);
  const shown = (await call(ctx, VIEWER, "get", "/")).body.sport.stats.map((s) => s.label);
  assert.deepEqual(shown, stored);
});

test("a request after a save never joins a read that started during it", async () => {
  const ctx = world();
  await call(ctx, VIEWER, "get", "/");
  const get = ctx.sports.get.bind(ctx.sports);
  const update = ctx.sports.updateExisting.bind(ctx.sports);
  let updating = false;
  let slowReads = 0;
  // While the save is writing, a read takes the old row and stays on its way past the save's end.
  ctx.sports.updateExisting = async (...args) => {
    updating = true;
    await new Promise((r) => setTimeout(r, 20));
    const answer = await update(...args);
    updating = false;
    return answer;
  };
  ctx.sports.get = async (...args) => {
    const answer = await get(...args);
    if (updating) { slowReads += 1; await new Promise((r) => setTimeout(r, 60)); }
    return answer;
  };
  // Make the kept copy expire, so the next read goes to the store.
  const save = call(ctx, MANAGER, "put", "/stats", { body: { stats: [{ label: "بعد" }] } });
  await new Promise((r) => setTimeout(r, 10));
  const during = call(ctx, VIEWER, "get", "/"); // starts during the write
  assert.equal((await save).statusCode, 200);
  const late = await call(ctx, VIEWER, "get", "/"); // starts after the save
  assert.deepEqual(late.body.sport.stats.map((s) => s.label), ["بعد"]);
  await during;
  assert.equal(slowReads, 1, "the overlapping read really happened");
});

test("saving a player queues its player photo; the photo route answers 404 until one is made", async () => {
  const ctx = world();
  live.photoJobs.length = 0;
  const saved = await call(ctx, COACH, "put", "/players/:studentId", { params: { studentId: sid(3) }, body: { jerseyNumber: 9, position: "x", lessonIds: [] } });
  assert.equal(saved.statusCode, 200);
  assert.deepEqual(live.photoJobs, [sid(3)]);
  const photo = await call(ctx, VIEWER, "get", "/players/:studentId/photo", { params: { studentId: sid(1) } });
  assert.equal(photo.statusCode, 404);
});

test("GET /players names the student's mentor (main_teacher), or nothing", async () => {
  const ctx = world();
  const r = await call(ctx, VIEWER, "get", "/players");
  const byId = new Map(r.body.players.map((p) => [p.studentId, p]));
  assert.equal(byId.get(sid(1)).mentor, "إبراهيم الوهباني");
  assert.equal(byId.get(sid(2)).mentor, "");
});

/* ---------- notices ---------- */

test("a coach posts a notice to every player: saved, announced, pushed to all players", async () => {
  const ctx = world();
  live.notices.length = 0;
  live.pushes.length = 0;
  live.students.length = 0;
  const r = await call(ctx, COACH, "post", "/notices", { body: { title: "  تدريب إضافي  ", body: "يوم الجمعة" } });
  assert.equal(r.statusCode, 201);
  assert.equal(r.body.notice.title, "تدريب إضافي");
  assert.equal(r.body.notice.lessonId, null);
  assert.equal(live.notices.length, 1);
  await new Promise((done) => setImmediate(done));
  const everyone = ctx.players.all().map((p) => String(p.studentId)).sort();
  assert.deepEqual(live.pushes.map(([ids]) => ids.sort()), [everyone]);
  assert.match(live.pushes[0][1].body, /تدريب إضافي/);
  assert.deepEqual(live.students[0][0].sort(), everyone);
});

test("a notice to one lesson reaches only that lesson's players", async () => {
  const ctx = world();
  live.notices.length = 0;
  live.pushes.length = 0;
  const lesson = ctx.lessons.all().find((l) => String(l._id) === LESSON_A);
  const r = await call(ctx, MANAGER, "post", "/notices", { body: { title: "x", lessonId: LESSON_A } });
  assert.equal(r.statusCode, 201);
  assert.equal(r.body.notice.lessonName, lesson.name);
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(live.pushes[0][0].sort(), (lesson.players || []).map((p) => String(p.studentId)).sort());
});

test("notices are validated: title, lengths, lesson and end date", async () => {
  const ctx = world();
  for (const body of [{}, { title: "  " }, { title: "x".repeat(81) }, { title: "x", body: "y".repeat(1001) },
    { title: "x", lessonId: "f".repeat(24) }, { title: "x", expiresOn: "2020-01-01" }, { title: "x", expiresOn: "soon" },
    { title: "x", expiresOn: "2099-02-31" }, { title: "x", expiresOn: "2099-04-31" }, { title: "x", expiresOn: "2099-02-29" }]) {
    const r = await call(ctx, COACH, "post", "/notices", { body });
    assert.equal(r.statusCode, 400, JSON.stringify(body));
  }
});

test("a viewer reads notices but cannot post or delete; a coach deletes", async () => {
  const ctx = world();
  live.notices.length = 0;
  const made = await call(ctx, COACH, "post", "/notices", { body: { title: "x" } });
  const list = await call(ctx, VIEWER, "get", "/notices");
  assert.equal(list.statusCode, 200);
  assert.equal(list.body.notices.length, 1);
  assert.equal(list.body.notices[0].expired, false);
  assert.equal((await call(ctx, VIEWER, "post", "/notices", { body: { title: "y" } })).statusCode, 403);
  const id = made.body.notice._id;
  assert.equal((await call(ctx, VIEWER, "delete", "/notices/:id", { params: { id } })).statusCode, 403);
  assert.equal((await call(ctx, COACH, "delete", "/notices/:id", { params: { id } })).statusCode, 200);
  assert.equal(live.notices.length, 0);
  assert.equal((await call(ctx, COACH, "delete", "/notices/:id", { params: { id } })).statusCode, 404);
});
