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
const OTHER_COACH = user("4", "900000004", { permissionGrants: ["sports.coach"] });
const VIEWER = user("5", "900000005", { permissionGrants: ["sports.view"] });
const sid = (n) => `${"5".repeat(23)}${n}`;
const STUDENTS = [1, 2, 3].map((n) => ({
  _id: sid(n), tz: `80000000${n}`, firstname: `F${n}`, lastname: `L${n}`, birth_date: "2012-01-01", gender: "ذكر",
  email: `s${n}@example.com`, photo: "https://example.test/p.png",
  health_status: "secret", father_phone: "0500000000", notes: "secret", address: "x", phone: "0500000001",
}));
const SPORT_A = hex("a");
const SPORT_B = hex("b");
const TEAM = hex("c");
const TRAINING = hex("e");

function world({ players, teams, trainings } = {}) {
  const sports = createStore([
    { _id: SPORT_A, name: "كرة القدم", icon: "⚽", stats: [{ key: "s_00000001", label: "أهداف" }] },
    { _id: SPORT_B, name: "السباحة", icon: "🏊", stats: [] },
  ]);
  const teamStore = createStore(teams || [
    { _id: TEAM, name: "الفريق", sportId: SPORT_A, coachIds: [COACH._id], members: [{ studentId: sid(1), joinedAt: "2026-01-01T00:00:00.000Z" }] },
  ]);
  const playerStore = createStore(players || [
    { _id: hex("f"), studentId: sid(1), sportId: SPORT_A, jerseyNumber: 7, position: "مهاجم" },
    { _id: hex("9"), studentId: sid(2), sportId: SPORT_A, jerseyNumber: null, position: "" },
  ]);
  const trainingStore = createStore(trainings || [
    { _id: TRAINING, teamId: TEAM, sportId: SPORT_A, startsAt: "2026-02-01T10:00:00.000Z", place: "الملعب", presentIds: [], recorded: false },
  ]);
  const students = createStore(STUDENTS);
  const users = createStore([GUIDE, MANAGER, COACH, OTHER_COACH, VIEWER]);
  const audit = auditStub();
  const controller = load("Sport/Sport.controller.js", {
    crypto: require("node:crypto"),
    "./Sport.model": { SportModelDef: sports },
    "./SportTeam.model": { SportTeamModelDef: teamStore },
    "./SportPlayer.model": { SportPlayerModelDef: playerStore },
    "./SportTraining.model": { SportTrainingModelDef: trainingStore },
    "../Student/Student.model": { StudentModelDef: students },
    "../User/User.model": { UserModelDef: users },
    "../../middleware/logger": { logWithSource() {} },
    "../../utils/permissions": require("../utils/permissions"),
    ...audit.deps,
  });
  return { controller, routes: loadRoutes(controller), sports, teams: teamStore, players: playerStore, trainings: trainingStore, audit };
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

test("a guide without sports keys gets 403 on GET /api/sports and every other route", async () => {
  const ctx = world();
  assert.equal((await call(ctx, GUIDE, "get", "/")).statusCode, 403);
  for (const route of ctx.routes) {
    const r = await call(ctx, GUIDE, route.method, route.path, { params: { id: TEAM, studentId: sid(1), sportId: SPORT_A } });
    assert.equal(r.statusCode, 403, `${route.method} ${route.path}`);
  }
  assert.equal((await call(ctx, VIEWER, "get", "/")).statusCode, 200);
  assert.equal((await call(ctx, VIEWER, "post", "/", { body: { name: "x" } })).statusCode, 403);
});

test("creating a sport with five stats is refused, a blank name or label too", async () => {
  const ctx = world();
  const five = ["a", "b", "c", "d", "e"].map((label) => ({ label }));
  assert.equal((await call(ctx, MANAGER, "post", "/", { body: { name: "س", icon: "⚽", stats: five } })).statusCode, 400);
  assert.equal((await call(ctx, MANAGER, "post", "/", { body: { name: "  ", stats: [] } })).statusCode, 400);
  assert.equal((await call(ctx, MANAGER, "post", "/", { body: { name: "س", stats: [{ label: " " }] } })).statusCode, 400);
  assert.equal((await call(ctx, MANAGER, "post", "/", { body: { name: "س", icon: "⚽⚽⚽⚽⚽" } })).statusCode, 400);
  const ok = await call(ctx, MANAGER, "post", "/", { body: { name: " الجري ", icon: "🏃", stats: [{ label: "سرعة" }] } });
  assert.equal(ok.statusCode, 201);
  assert.equal(ok.body.sport.name, "الجري");
  assert.match(ok.body.sport.stats[0].key, /^s_[0-9a-f]{8}$/);
  assert.equal(ctx.audit.find({ module: "sports", action: "create", targetType: "sport" }).length, 1);
});

test("renaming a stat keeps its key, a new stat gets a fresh key", async () => {
  const ctx = world();
  const r = await call(ctx, MANAGER, "put", "/:id", {
    params: { id: SPORT_A },
    body: { name: "كرة القدم", icon: "⚽", stats: [{ key: "s_00000001", label: "تسجيل" }, { label: "تمريرات" }, { key: "s_forged00", label: "مزوّر" }] },
  });
  assert.equal(r.statusCode, 200);
  const stats = plain(r.body.sport.stats);
  assert.deepEqual(stats[0], { key: "s_00000001", label: "تسجيل" });
  assert.match(stats[1].key, /^s_[0-9a-f]{8}$/);
  assert.notEqual(stats[1].key, stats[2].key);
  assert.notEqual(stats[2].key, "s_forged00");
});

test("a sport with teams or players cannot be deleted, an unused one can", async () => {
  const ctx = world();
  const blocked = await call(ctx, MANAGER, "delete", "/:id", { params: { id: SPORT_A } });
  assert.equal(blocked.statusCode, 409);
  assert.equal(blocked.body.message, "لا يمكن حذف رياضة لها فرق أو لاعبون");
  assert.equal((await call(ctx, MANAGER, "delete", "/:id", { params: { id: SPORT_B } })).statusCode, 200);
  assert.equal(ctx.sports.all().length, 1);
});

test("coaches are active users holding sports.coach or sports.manage", async () => {
  const ctx = world();
  const r = await call(ctx, VIEWER, "get", "/coaches");
  assert.deepEqual(plain(r.body.coaches).map((c) => c.id).sort(), [MANAGER._id, COACH._id, OTHER_COACH._id].sort());
  assert.deepEqual(Object.keys(r.body.coaches[0]).sort(), ["firstname", "id", "lastname"]);
  const bad = await call(ctx, MANAGER, "post", "/teams", { body: { name: "ف", sportId: SPORT_A, coachIds: [GUIDE._id] } });
  assert.equal(bad.statusCode, 400);
  const good = await call(ctx, MANAGER, "post", "/teams", { body: { name: "ف", sportId: SPORT_A, coachIds: [COACH._id] } });
  assert.equal(good.statusCode, 201);
});

test("the team list carries coach and member names", async () => {
  const ctx = world();
  const r = await call(ctx, VIEWER, "get", "/teams");
  assert.deepEqual(plain(r.body.teams[0].coachNames), ["U3 N3"]);
  assert.equal(r.body.teams[0].members[0].firstname, "F1");
});

test("a coach who is not on the team cannot change its trainings; a manager can", async () => {
  const ctx = world();
  const body = { place: "قاعة" };
  assert.equal((await call(ctx, OTHER_COACH, "put", "/trainings/:id", { params: { id: TRAINING }, body })).statusCode, 403);
  assert.equal((await call(ctx, OTHER_COACH, "delete", "/trainings/:id", { params: { id: TRAINING } })).statusCode, 403);
  assert.equal((await call(ctx, OTHER_COACH, "post", "/teams/:id/trainings", { params: { id: TEAM }, body: { startsAt: "2026-03-01T10:00:00Z" } })).statusCode, 403);
  assert.equal((await call(ctx, MANAGER, "put", "/trainings/:id", { params: { id: TRAINING }, body })).statusCode, 200);
  assert.equal((await call(ctx, COACH, "put", "/trainings/:id", { params: { id: TRAINING }, body })).statusCode, 200);
  assert.equal((await call(ctx, COACH, "delete", "/trainings/:id", { params: { id: TRAINING } })).statusCode, 200);
});

test("trainings are created unrecorded and listed newest first", async () => {
  const ctx = world();
  const created = await call(ctx, COACH, "post", "/teams/:id/trainings", { params: { id: TEAM }, body: { startsAt: "2026-03-01T10:00:00Z", place: "الملعب" } });
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.training.recorded, false);
  assert.deepEqual(plain(created.body.training.presentIds), []);
  assert.equal((await call(ctx, COACH, "post", "/teams/:id/trainings", { params: { id: TEAM }, body: { startsAt: "nope" } })).statusCode, 400);
  const list = await call(ctx, VIEWER, "get", "/teams/:id/trainings", { params: { id: TEAM } });
  assert.deepEqual(list.body.trainings.map((t) => t._id), [created.body.training._id, TRAINING]);
});

test("members must be players of the team's sport and keep their joinedAt", async () => {
  const ctx = world();
  const bad = await call(ctx, COACH, "put", "/teams/:id/members", { params: { id: TEAM }, body: { studentIds: [sid(1), sid(3)] } });
  assert.equal(bad.statusCode, 400);
  assert.equal((await call(ctx, OTHER_COACH, "put", "/teams/:id/members", { params: { id: TEAM }, body: { studentIds: [sid(1)] } })).statusCode, 403);
  const ok = await call(ctx, COACH, "put", "/teams/:id/members", { params: { id: TEAM }, body: { studentIds: [sid(1), sid(2)] } });
  assert.equal(ok.statusCode, 200);
  const members = plain(ctx.teams.all()[0].members);
  assert.equal(members.find((m) => m.studentId === sid(1)).joinedAt, "2026-01-01T00:00:00.000Z");
  assert.ok(members.find((m) => m.studentId === sid(2)).joinedAt);
});

test("saving attendance marks the training recorded and rejects non-members", async () => {
  const ctx = world();
  const bad = await call(ctx, COACH, "put", "/trainings/:id", { params: { id: TRAINING }, body: { presentIds: [sid(2)] } });
  assert.equal(bad.statusCode, 400);
  assert.equal(ctx.trainings.all()[0].recorded, false);
  const ok = await call(ctx, COACH, "put", "/trainings/:id", { params: { id: TRAINING }, body: { presentIds: [sid(1)] } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.training.recorded, true);
  assert.deepEqual(plain(ok.body.training.presentIds), [sid(1)]);
});

test("player list exposes only sport fields", async () => {
  const ctx = world();
  const r = await call(ctx, VIEWER, "get", "/players");
  assert.equal(r.body.players.length, 2);
  const expected = ["birth_date", "email", "firstname", "gender", "jerseyNumber", "lastname", "photo", "position", "sportId", "studentId"];
  for (const p of r.body.players) assert.deepEqual(Object.keys(p).sort(), expected);
  assert.equal(JSON.stringify(r.body).includes("secret"), false);
  assert.equal(JSON.stringify(r.body).includes("father_phone"), false);
});

test("student search spans all students, needs 2 characters, and returns limited fields", async () => {
  const ctx = world();
  assert.deepEqual(plain((await call(ctx, COACH, "get", "/students/search", { query: { q: "F" } })).body.students), []);
  const byName = await call(ctx, COACH, "get", "/students/search", { query: { q: "f3" } });
  assert.equal(byName.body.students.length, 1);
  assert.deepEqual(Object.keys(byName.body.students[0]).sort(), ["_id", "birth_date", "email", "firstname", "gender", "lastname", "tz"]);
  assert.equal((await call(ctx, COACH, "get", "/students/search", { query: { q: "80000000" } })).body.students.length, 3);
  assert.equal((await call(ctx, VIEWER, "get", "/students/search", { query: { q: "F1" } })).statusCode, 403);
});

test("a player is created with a validated jersey number and position", async () => {
  const ctx = world();
  const params = { studentId: sid(3), sportId: SPORT_A };
  assert.equal((await call(ctx, COACH, "put", "/players/:studentId/:sportId", { params, body: { jerseyNumber: 100 } })).statusCode, 400);
  assert.equal((await call(ctx, COACH, "put", "/players/:studentId/:sportId", { params, body: { jerseyNumber: 1.5 } })).statusCode, 400);
  assert.equal((await call(ctx, COACH, "put", "/players/:studentId/:sportId", { params, body: { position: "x".repeat(31) } })).statusCode, 400);
  const ok = await call(ctx, COACH, "put", "/players/:studentId/:sportId", { params, body: { jerseyNumber: "10", position: " حارس " } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.player.jerseyNumber, 10);
  assert.equal(ok.body.player.position, "حارس");
  const cleared = await call(ctx, COACH, "put", "/players/:studentId/:sportId", { params, body: { jerseyNumber: null } });
  assert.equal(cleared.body.player.jerseyNumber, null);
  assert.equal(ctx.players.all().filter((p) => p.studentId === sid(3)).length, 1);
});

test("deleting a player removes them from that sport's teams", async () => {
  const ctx = world();
  const r = await call(ctx, COACH, "delete", "/players/:studentId/:sportId", { params: { studentId: sid(1), sportId: SPORT_A } });
  assert.equal(r.statusCode, 200);
  assert.equal(ctx.players.all().some((p) => p.studentId === sid(1)), false);
  assert.deepEqual(plain(ctx.teams.all()[0].members), []);
});

test("deleting a team deletes its trainings, and every write is audited", async () => {
  const ctx = world();
  assert.equal((await call(ctx, MANAGER, "delete", "/teams/:id", { params: { id: TEAM } })).statusCode, 200);
  assert.equal(ctx.trainings.all().length, 0);
  assert.equal(ctx.audit.find({ module: "sports", action: "delete", targetType: "team" }).length, 1);
});
