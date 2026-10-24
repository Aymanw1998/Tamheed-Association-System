const assert = require("node:assert/strict");
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
  email: `s${n}@example.com`, health_status: "secret", father_phone: "0500000000", notes: "secret",
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
    "../../middleware/logger": { logWithSource() {} },
    "../../utils/sportCards": require("../utils/sportCards"),
    ...audit.deps,
  });
  return { controller, routes: loadRoutes(controller), sports, players: playerStore, lessons, attendance, audit };
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
    "PUT /players/:studentId", "DELETE /players/:studentId", "POST /players/:studentId/stats",
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
  const expected = ["age", "attendance", "firstname", "gender", "jerseyNumber", "lastname", "layer", "lessons", "position", "school", "studentId", "values"];
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
  assert.equal(text.includes("80000000"), false);
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

test("student search matches names only, never tz, and never returns tz", async () => {
  const ctx = world();
  const search = (q) => call(ctx, COACH, "get", "/students/search", { query: { q } });
  assert.deepEqual(plain((await search("F")).body.students), []);
  const byName = await search("fa3");
  assert.equal(byName.body.students.length, 1);
  assert.deepEqual(Object.keys(byName.body.students[0]).sort(), ["_id", "age", "firstname", "gender", "isPlayer", "lastname", "layer", "school"]);
  assert.equal(byName.body.students[0].isPlayer, false);
  assert.equal((await search("fa1")).body.students[0].isPlayer, true);
  assert.deepEqual(plain((await search("80000000")).body.students), []);
  assert.deepEqual(plain((await search("00000")).body.students), []);
  assert.equal((await search("l")).body.students.length, 0); // one character is too short
  const both = await search("ki1");
  for (const s of both.body.students) assert.equal("tz" in s, false);
  assert.equal(JSON.stringify(both.body).includes("80000000"), false);
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
