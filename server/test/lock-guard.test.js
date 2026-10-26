const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { createLockGuard, checkVersion } = require("../middleware/lockGuard");

/* ================= the guard itself ================= */
const HOLDER = { name: "Holder Name", tz: "900000001" };

// A fake lock service: `held` maps key -> { clientId, ...holder }.
function fakeLocks(held = {}) {
  const asked = [];
  return {
    asked,
    async holderOf(key, clientId) {
      asked.push([key, clientId]);
      const row = held[key];
      return !row || row.clientId === clientId ? null : { name: row.name, tz: row.tz };
    },
  };
}

const makeReq = (clientId, extra = {}) => ({
  get: (name) => (name.toLowerCase() === "x-client-id" ? clientId : undefined),
  params: {}, body: {}, ...extra,
});
const makeRes = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

async function run(middleware, req) {
  const res = makeRes();
  let passed = false;
  await middleware(req, res, () => { passed = true; });
  return { res, passed };
}

const guardFor = (held) => {
  const locks = fakeLocks(held);
  return { locks, ...createLockGuard({ locks: () => locks }) };
};

test("the tab that holds the lock passes", async () => {
  const { requireFreeOrMine } = guardFor({ "student:1": { clientId: "tab-a", ...HOLDER } });
  const { passed, res } = await run(requireFreeOrMine(() => "student:1"), makeReq("tab-a"));
  assert.equal(passed, true);
  assert.equal(res.statusCode, 200);
});

test("another tab gets 423 with the holder's name and ID number", async () => {
  const { requireFreeOrMine } = guardFor({ "student:1": { clientId: "tab-a", ...HOLDER } });
  const { passed, res } = await run(requireFreeOrMine(() => "student:1"), makeReq("tab-b"));
  assert.equal(passed, false);
  assert.equal(res.statusCode, 423);
  assert.deepEqual(res.body, { ok: false, code: "LOCKED", holder: HOLDER, message: "هذا العنصر مفتوح الآن لدى Holder Name (900000001)" });
});

test("the 423 message leaves out () when the holder has no ID number", async () => {
  const { requireFreeOrMine } = guardFor({ "student:1": { clientId: "tab-a", name: "Holder Name", tz: "" } });
  const { res } = await run(requireFreeOrMine(() => "student:1"), makeReq("tab-b"));
  assert.equal(res.body.message, "هذا العنصر مفتوح الآن لدى Holder Name");
});

test("a request without a client id is blocked by someone else's lock", async () => {
  const { requireFreeOrMine } = guardFor({ "student:1": { clientId: "tab-a", ...HOLDER } });
  const { res } = await run(requireFreeOrMine(() => "student:1"), makeReq(undefined));
  assert.equal(res.statusCode, 423);
});

test("an unlocked item passes, and the key may be resolved asynchronously", async () => {
  const { requireFreeOrMine, locks } = guardFor({});
  const { passed } = await run(requireFreeOrMine(async (req) => `vehicle:${req.params.id}`), makeReq("tab-b", { params: { id: "v1" } }));
  assert.equal(passed, true);
  assert.deepEqual(locks.asked, [["vehicle:v1", "tab-b"]]);
});

test("an unresolved key (no such item) passes through to the controller", async () => {
  const { requireFreeOrMine, locks } = guardFor({});
  const { passed } = await run(requireFreeOrMine(async () => null), makeReq("tab-b"));
  assert.equal(passed, true);
  assert.equal(locks.asked.length, 0);
});

test("a failing lock lookup answers 500, never lets the write through", async () => {
  const { requireFreeOrMine } = createLockGuard({ locks: () => ({ async holderOf() { throw new Error("down"); } }) });
  const { passed, res } = await run(requireFreeOrMine(() => "student:1"), makeReq("tab-b"));
  assert.equal(passed, false);
  assert.equal(res.statusCode, 500);
});

test("assertFree throws a 423 error carrying the holder, and is silent when free", async () => {
  const { assertFree } = guardFor({ "report:9": { clientId: "tab-a", ...HOLDER } });
  await assert.rejects(() => assertFree("report:9"), (error) => {
    assert.equal(error.status, 423);
    assert.deepEqual(error.holder, HOLDER);
    return true;
  });
  await assertFree("report:10");
});

test("a stale baseVersion gives the STALE body with the current item", () => {
  const current = { _id: "1", updatedAt: new Date("2026-10-25T10:00:05.000Z") };
  const stale = checkVersion(current, { body: { baseVersion: "2026-10-25T10:00:00.000Z" } });
  assert.deepEqual(stale, { ok: false, code: "STALE", current, message: "تم تعديل هذا العنصر من قِبل مستخدم آخر أثناء غيابك." });
  const named = checkVersion({ ...current, updatedByName: "Sara" }, { body: { baseVersion: "2026-10-25T10:00:00.000Z" } });
  assert.equal(named.message, "تم تعديل هذا العنصر من قِبل Sara أثناء غيابك.");
});

test("the same version passes, as an ISO string or a Date", () => {
  const stored = new Date("2026-10-25T10:00:05.000Z");
  assert.equal(checkVersion({ updatedAt: stored }, { body: { baseVersion: stored.toISOString() } }), null);
  assert.equal(checkVersion({ updatedAt: stored.toISOString() }, { body: { baseVersion: stored } }), null);
});

test("a missing baseVersion (old client) or a missing stored updatedAt passes", () => {
  assert.equal(checkVersion({ updatedAt: new Date() }, { body: {} }), null);
  assert.equal(checkVersion({ updatedAt: new Date() }, {}), null);
  assert.equal(checkVersion({}, { body: { baseVersion: "2026-10-25T10:00:00.000Z" } }), null);
});

test("the STALE body can be shaped by a view (so secrets never leave)", () => {
  const current = { updatedAt: "2026-10-25T10:00:05.000Z", password: "hash" };
  const stale = checkVersion(current, { body: { baseVersion: "2026-10-25T10:00:00.000Z" } }, ({ password, ...rest }) => rest);
  assert.deepEqual(stale.current, { updatedAt: "2026-10-25T10:00:05.000Z" });
});

/* ================= the routes: a held item never reaches the controller ================= */
// Runs a route file with a recording Router, inert dependencies and a spy for
// every controller function, then executes one route's chain by hand.
function loadRoutes(file, { models = {}, locks }) {
  const routes = [];
  const calls = [];
  const spy = (name) => (req, res) => { calls.push(name); return res.status(200).json({ ok: true }); };
  const controllers = new Proxy({}, { get: (_, name) => (typeof name === "string" ? spy(name) : undefined) });
  const middlewareStub = (req, res, next) => next();
  const router = { use() {} };
  for (const method of ["get", "post", "put", "patch", "delete"]) {
    router[method] = (route, ...handlers) => routes.push({ method: method.toUpperCase(), route, handlers });
  }
  const lockGuard = createLockGuard({ locks: () => locks });
  const multer = Object.assign(() => ({ single: () => middlewareStub }), { memoryStorage: () => ({}) });
  const dependencies = (name) => {
    if (name === "express") return { Router: () => router };
    if (name === "multer") return multer;
    if (/lockGuard/.test(name)) return lockGuard;
    if (/permissionMiddleware/.test(name)) {
      return { loadActor: middlewareStub, requirePermission: () => middlewareStub, requireSelfOr: () => middlewareStub };
    }
    if (/authMiddleware/.test(name)) return { requireAuth: middlewareStub };
    if (/rateLimit/.test(name)) return { rateLimit: () => middlewareStub };
    if (/utils\/permissions/.test(name)) return require("../utils/permissions");
    if (/vehicleFiles/.test(name)) return { MAX_DOCUMENT_BYTES: 1 };
    if (/aiFeature/.test(name)) return { aiEnabled: () => false };
    if (/VehicleExtract/.test(name)) return { defaultController: () => ({ extractDocument: spy("extractDocument") }) };
    if (/Vehicle\.controller/.test(name)) {
      return new Proxy({}, { get: (_, key) => (key === "requireVehiclePermission" ? () => middlewareStub : spy(String(key))) });
    }
    if (/\.controller/i.test(name)) return controllers;
    if (/\.model/.test(name)) return models;
    if (name === "mongoose") return {};
    throw new Error(`Unexpected dependency: ${name}`);
  };
  const filename = path.join(__dirname, "..", "Entities", file);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), { module, require: dependencies, console }, { filename });
  const call = async (method, route, req) => {
    const entry = routes.find((r) => r.method === method && r.route === route);
    assert.ok(entry, `${method} ${route} is not declared`);
    calls.length = 0;
    const res = makeRes();
    for (const handler of entry.handlers) {
      let advanced = false;
      await handler(req, res, () => { advanced = true; });
      if (!advanced) break;
    }
    return { res, calls: [...calls] };
  };
  return { call };
}

const modelReturning = (name, rows) => ({
  [name]: { async get(filter) { return { success: true, result: rows.filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v)) }; } },
});

test("PUT /api/student/:tz while another tab holds student:<id> is 423 and never reaches the controller", async () => {
  const locks = fakeLocks({ "student:s1": { clientId: "tab-a", ...HOLDER } });
  const { call } = loadRoutes("Student/Student.route.js", { locks, models: modelReturning("StudentModelDef", [{ _id: "s1", tz: "800000001" }]) });
  const blocked = await call("PUT", "/:tz", makeReq("tab-b", { params: { tz: "800000001" } }));
  assert.equal(blocked.res.statusCode, 423);
  assert.deepEqual(blocked.res.body.holder, HOLDER);
  assert.deepEqual(blocked.calls, []);
  const mine = await call("PUT", "/:tz", makeReq("tab-a", { params: { tz: "800000001" } }));
  assert.equal(mine.res.statusCode, 200);
  assert.deepEqual(mine.calls, ["putS"]);
});

test("student photo upload and delete are refused before any Drive call while held", async () => {
  const locks = fakeLocks({ "student:s1": { clientId: "tab-a", ...HOLDER } });
  const { call } = loadRoutes("Student/Student.route.js", { locks, models: modelReturning("StudentModelDef", [{ _id: "s1", tz: "800000001" }]) });
  for (const [method, route] of [["POST", "/upload-photo/:tz"], ["DELETE", "/photo/:tz"], ["DELETE", "/:tz"]]) {
    const { res, calls } = await call(method, route, makeReq("tab-b", { params: { tz: "800000001" } }));
    assert.equal(res.statusCode, 423, `${method} ${route}`);
    assert.deepEqual(calls, []);
  }
});

test("user writes while another tab holds user:<id> are 423 (any room), photo routes included", async () => {
  const locks = fakeLocks({ "user:u1": { clientId: "tab-a", ...HOLDER } });
  const models = {
    UserModelDef: {
      async get(filter, room) {
        return { success: true, result: room === "waiting" && filter.tz === "900000009" ? [{ _id: "u1", tz: "900000009" }] : [] };
      },
    },
  };
  const { call } = loadRoutes("User/User.route.js", { locks, models });
  for (const [method, route] of [["PUT", "/:tz"], ["POST", "/upload-photo/:tz"], ["DELETE", "/photo/:tz"], ["PUT", "/:tz/role"], ["DELETE", "/:tz/:from"]]) {
    const { res, calls } = await call(method, route, makeReq("tab-b", { params: { tz: "900000009" } }));
    assert.equal(res.statusCode, 423, `${method} ${route}`);
    assert.deepEqual(calls, []);
  }
});

test("vehicle writes while another tab holds vehicle:<id> are 423; creating takes no lock check", async () => {
  const locks = fakeLocks({ "vehicle:v1": { clientId: "tab-a", ...HOLDER } });
  const { call } = loadRoutes("Vehicle/Vehicle.route.js", { locks });
  for (const [method, route] of [["PUT", "/:id"], ["DELETE", "/:id"], ["POST", "/:id/licenses"], ["POST", "/:id/documents"], ["DELETE", "/:id/documents/:docId"]]) {
    const { res, calls } = await call(method, route, makeReq("tab-b", { params: { id: "v1" } }));
    assert.equal(res.statusCode, 423, `${method} ${route}`);
    assert.deepEqual(calls, []);
  }
  locks.asked.length = 0;
  const created = await call("POST", "/", makeReq("tab-b"));
  assert.equal(created.res.statusCode, 200);
  assert.equal(locks.asked.length, 0);
});

test("report update and delete while another tab holds report:<id> are 423", async () => {
  const locks = fakeLocks({ "report:r1": { clientId: "tab-a", ...HOLDER } });
  const { call } = loadRoutes("Report/Report.route.js", { locks, models: modelReturning("ReportModelDef", [{ _id: "r1", createdBy: "u-owner" }]) });
  for (const method of ["PUT", "DELETE"]) {
    const { res, calls } = await call(method, "/:id", makeReq("tab-b", { params: { id: "r1" }, user: { id: "u-owner" } }));
    assert.equal(res.statusCode, 423, method);
    assert.deepEqual(calls, []);
  }
  const mine = await call("PUT", "/:id", makeReq("tab-a", { params: { id: "r1" }, user: { id: "u-owner" } }));
  assert.deepEqual(mine.calls, ["put"]);
});

test("an editOwn caller editing someone else's held report never learns the holder: the controller answers (403)", async () => {
  const locks = fakeLocks({ "report:r1": { clientId: "tab-a", ...HOLDER } });
  const { call } = loadRoutes("Report/Report.route.js", { locks, models: modelReturning("ReportModelDef", [{ _id: "r1", createdBy: "u-owner" }]) });
  const other = await call("PUT", "/:id", makeReq("tab-b", { params: { id: "r1" }, user: { id: "u-other", tz: "900000002" } }));
  assert.notEqual(other.res.statusCode, 423);
  assert.equal(other.res.body.holder, undefined);
  assert.deepEqual(other.calls, ["put"], "the controller's ownership check answers");
  // reports.editAll may edit any report, so it is told who holds it.
  const admin = await call("PUT", "/:id", makeReq("tab-b", { params: { id: "r1" }, user: { id: "u-admin" }, actor: { permissions: new Set(["reports.editAll"]) } }));
  assert.equal(admin.res.statusCode, 423);
});

test("lesson writes and roster changes while another tab holds lesson:<id> are 423; creating takes no lock check", async () => {
  const locks = fakeLocks({ "lesson:l1": { clientId: "tab-a", ...HOLDER } });
  const { call } = loadRoutes("Lesson/Lesson.route.js", { locks });
  for (const [method, route] of [["PUT", "/:id"], ["DELETE", "/:id"], ["POST", "/addToList/:id"], ["POST", "/removeFromList/:id"]]) {
    const { res, calls } = await call(method, route, makeReq("tab-b", { params: { id: "l1" } }));
    assert.equal(res.statusCode, 423, `${method} ${route}`);
    assert.deepEqual(res.body.holder, HOLDER);
    assert.deepEqual(calls, []);
  }
  locks.asked.length = 0;
  const created = await call("POST", "/", makeReq("tab-b"));
  assert.equal(created.res.statusCode, 200);
  assert.equal(locks.asked.length, 0);
});

test("attendance bulk-save is locked per lesson AND date: a held sheet gives 423, another date of the lesson is free", async () => {
  const locks = fakeLocks({ "attendance:L1:2026-10-25": { clientId: "tab-a", ...HOLDER } });
  const { call } = loadRoutes("Attendance/Attendance.route.js", { locks });
  const body = (day) => ({ lessonId: "L1", year: 2026, month: 10, day, items: [] });
  const blocked = await call("POST", "/bulk-save", makeReq("tab-b", { body: body(25) }));
  assert.equal(blocked.res.statusCode, 423);
  assert.deepEqual(blocked.res.body.holder, HOLDER);
  assert.deepEqual(blocked.calls, []);
  const other = await call("POST", "/bulk-save", makeReq("tab-b", { body: body(26) }));
  assert.equal(other.res.statusCode, 200);
  assert.deepEqual(other.calls, ["bulkSave"]);
  const mine = await call("POST", "/bulk-save", makeReq("tab-a", { body: body(25) }));
  assert.deepEqual(mine.calls, ["bulkSave"]);
});

test("sport writes: a stats bump while another tab holds player:<studentId> is 423, and every item kind has its own key", async () => {
  const held = {
    "player:s1": { clientId: "tab-a", ...HOLDER },
    "sportLesson:sl1": { clientId: "tab-a", ...HOLDER },
    "sportAttendance:sl1:2026-10-25": { clientId: "tab-a", ...HOLDER },
  };
  const locks = fakeLocks(held);
  const { call } = loadRoutes("Sport/Sport.route.js", { locks });
  const cases = [
    ["POST", "/players/:studentId/stats", { params: { studentId: "s1" } }],
    ["PUT", "/players/:studentId", { params: { studentId: "s1" } }],
    ["DELETE", "/players/:studentId", { params: { studentId: "s1" } }],
    ["PUT", "/lessons/:id", { params: { id: "sl1" } }],
    ["DELETE", "/lessons/:id", { params: { id: "sl1" } }],
    ["POST", "/lessons/:id/players", { params: { id: "sl1" } }],
    ["DELETE", "/lessons/:id/players/:studentId", { params: { id: "sl1", studentId: "s9" } }],
    ["PUT", "/lessons/:id/attendance", { params: { id: "sl1" }, body: { date: "2026-10-25" } }],
  ];
  for (const [method, route, extra] of cases) {
    const { res, calls } = await call(method, route, makeReq("tab-b", extra));
    assert.equal(res.statusCode, 423, `${method} ${route}`);
    assert.deepEqual(calls, []);
  }
  const free = await call("PUT", "/lessons/:id/attendance", makeReq("tab-b", { params: { id: "sl1" }, body: { date: "2026-10-26" } }));
  assert.equal(free.res.statusCode, 200);
  locks.asked.length = 0;
  const created = await call("POST", "/lessons", makeReq("tab-b"));
  assert.equal(created.res.statusCode, 200);
  assert.equal(locks.asked.length, 0);
});
