// The system account (SYSTEM_ADMIN_TZ) is invisible: it is left out of every
// user list and answers as missing to everyone but itself. What it does is
// stored as "system" / "النظام", never under its tz.
// Also: changing another user's email needs users.passwords, and a failed
// tz-existence check is a server error, never "not found".
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { actorFor } = require("./helpers/actors");
const { auditStub } = require("./helpers/auditStub");

// Synthetic, checksum-valid ID numbers (not real people).
const SYSTEM_TZ = "000000026";
const NEW_TZ = "000000018";
process.env.SYSTEM_ADMIN_TZ = SYSTEM_TZ;

const ADMIN = "ادارة";
const GUIDE = "مرشد";

function withSystemTz(value, fn) {
  const had = Object.hasOwn(process.env, "SYSTEM_ADMIN_TZ");
  const previous = process.env.SYSTEM_ADMIN_TZ;
  process.env.SYSTEM_ADMIN_TZ = value;
  const restore = () => { if (had) process.env.SYSTEM_ADMIN_TZ = previous; else delete process.env.SYSTEM_ADMIN_TZ; };
  return Promise.resolve().then(fn).finally(restore);
}

// Room-aware in-memory UserModelDef. `failGet` makes every read throw.
function createUsers(seed = {}, { failGet = false } = {}) {
  const rooms = { active: [], waiting: [], noActive: [], ...structuredClone(seed) };
  let next = 1;
  const matches = (doc, filter) => Object.keys(filter).every((k) => {
    const want = filter[k];
    if (want && typeof want === "object" && "$regex" in want) return new RegExp(want.$regex).test(String(doc[k] ?? ""));
    return String(doc[k]) === String(want);
  });
  return {
    collections: { active: "Users" },
    async get(filter = {}, room = "active") {
      if (failGet) throw new Error("database unavailable");
      const result = rooms[room].filter((d) => matches(d, filter)).map((d) => structuredClone(d));
      return { success: true, count: result.length, result };
    },
    async create(data, room = "active") {
      const doc = { _id: `user-${next++}`, ...structuredClone(data) };
      rooms[room].push(doc);
      return { success: true, result: structuredClone(doc) };
    },
    async update(filter, data, room = "active") {
      const hit = rooms[room].find((d) => matches(d, filter));
      if (hit) Object.assign(hit, structuredClone(data));
      return { success: true, result: hit ? structuredClone(hit) : null };
    },
    async delete() { return { success: true }; },
    rooms,
  };
}

function loadUserController(users) {
  const audit = auditStub();
  const dependencies = {
    bcryptjs: {},
    jsonwebtoken: {},
    path,
    "./User.model": { UserModelDef: users },
    "../../utils/otp": require("../utils/otp"),
    "../../utils/sendEmail": {},
    "../../utils/jwt": {},
    "../../utils/textEncoding": require("../utils/textEncoding"),
    "../../utils/permissions": require("../utils/permissions"),
    "../../utils/permissionRules": require("../utils/permissionRules"),
    "../../utils/israeliId": require("../utils/israeliId"),
    "../../utils/tourState": require("../utils/tourState"),
    "../../utils/loginLockout": require("../utils/loginLockout"),
    "../../utils/systemPassword": require("../utils/systemPassword"),
    "../../middleware/logger": { logWithSource() {} },
    "./passwordCrypto": {},
    "../UploadFile/file": {},
    "../Storage/Storage.controller": {
      buildUserStorageFolder: (u = {}) => u.storageFolder || `users/${u.tz}`,
      ensureUserStorageFolder: async () => {},
      syncStorageViewPermissionsForUser: async () => {},
    },
    "../Notification/Notification.controller": {},
    ...require("./helpers/alertEventsStub").noopAlertDeps,
    ...audit.deps,
  };
  const filename = path.join(__dirname, "../Entities/User/User.controller.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    console: { log() {}, warn() {}, error() {} },
    process,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return module.exports;
}

const SYS = { _id: "s0", tz: SYSTEM_TZ, firstname: "Sys", lastname: "Tem", email: "system@example.test" };
const ADMIN_USER = { _id: "a1", tz: "admin-1", firstname: "Ad", lastname: "Min", role: ADMIN, roles: [ADMIN] };
// An administrator who may also set other users' passwords.
const KEY_ADMIN = { ...ADMIN_USER, _id: "a3", tz: "admin-3", permissionGrants: ["users.passwords"] };
const GUIDE_USER = { _id: "g1", tz: "guide-1", firstname: "Gu", lastname: "Ide", role: GUIDE, roles: [GUIDE],
  email: "guide@example.test" };

const seed = () => ({
  active: [SYS, ADMIN_USER, KEY_ADMIN, GUIDE_USER],
  // Defensive: a stray copy of the system account in another room is hidden too.
  waiting: [{ ...SYS, _id: "s1" }],
  noActive: [{ ...SYS, _id: "s2" }],
});

const actorOf = (user) => actorFor(user, { isSystem: user.tz === SYSTEM_TZ && Boolean(process.env.SYSTEM_ADMIN_TZ) });
const res = () => ({ statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });
const plain = (v) => JSON.parse(JSON.stringify(v ?? null));

async function call(handler, actorUser, extra = {}, users = createUsers(seed())) {
  const controller = loadUserController(users);
  const out = res();
  const req = { user: { tz: actorUser.tz, id: actorUser._id }, actor: actorOf(actorUser), params: {}, query: {}, body: {}, ip: "127.0.0.1", ...extra };
  await controller[handler](req, out);
  return { res: out, body: plain(out.body), users };
}

/* ================= lists and lookup ================= */

test("getAllU leaves the system account out of every room", async () => {
  for (const actor of [ADMIN_USER, SYS]) {
    const { res: out, body } = await call("getAllU", actor);
    assert.equal(out.statusCode, 200);
    assert.deepEqual(body.users.map((u) => u.tz).sort(), [ADMIN_USER.tz, KEY_ADMIN.tz, GUIDE_USER.tz].sort());
  }
});

test("getOneU answers 404 for the system account by tz or id, except to itself", async () => {
  for (const identity of [SYSTEM_TZ, "s0", "s1", "s2"]) {
    const { res: out, body } = await call("getOneU", ADMIN_USER, { params: { tz: identity } });
    assert.equal(out.statusCode, 404, identity);
    assert.ok(!JSON.stringify(body).includes(SYSTEM_TZ));
  }
  const self = await call("getOneU", SYS, { params: { tz: SYSTEM_TZ } });
  assert.equal(self.res.statusCode, 200);
  assert.equal(self.body.user.tz, SYSTEM_TZ);

  const other = await call("getOneU", ADMIN_USER, { params: { tz: GUIDE_USER.tz } });
  assert.equal(other.res.statusCode, 200);
});

test("getOneU adds tourSummary only for an active user (reset works on active users only)", async () => {
  const tours = { "journey-intro": { status: "done", version: 1 } };
  const waitingGuide = { ...GUIDE_USER, _id: "g2", tz: "guide-2", tours };
  const closedGuide = { ...GUIDE_USER, _id: "g3", tz: "guide-3", tours };
  const users = createUsers({
    active: [ADMIN_USER, { ...GUIDE_USER, tours }],
    waiting: [waitingGuide],
    noActive: [closedGuide],
  });
  const active = await call("getOneU", ADMIN_USER, { params: { tz: GUIDE_USER.tz } }, users);
  assert.equal(active.body.room, "active");
  assert.deepEqual(active.body.user.tourSummary, { intro: "done", done: 1, skipped: 0 });
  for (const tz of [waitingGuide.tz, closedGuide.tz]) {
    const { res: out, body } = await call("getOneU", ADMIN_USER, { params: { tz } }, users);
    assert.equal(out.statusCode, 200, tz);
    assert.notEqual(body.room, "active");
    assert.equal(body.user.tourSummary, undefined, tz);
  }
});

test("viewPassword answers 404 for the system account", async () => {
  const { res: out } = await call("viewPassword", KEY_ADMIN, { params: { tz: SYSTEM_TZ } });
  assert.equal(out.statusCode, 404);
});

test("with SYSTEM_ADMIN_TZ blank nobody is hidden, blank tz included, and nothing throws", async () => {
  await withSystemTz("", async () => {
    const blank = { _id: "b1", tz: "", firstname: "Blank" };
    const spaced = { _id: "b2", tz: " ", firstname: "Spaced" };
    const users = createUsers({ active: [ADMIN_USER, blank, spaced, SYS] });
    const all = await call("getAllU", ADMIN_USER, {}, users);
    assert.equal(all.res.statusCode, 200);
    assert.equal(all.body.users.length, 4);

    const one = await call("getOneU", ADMIN_USER, { params: { tz: SYSTEM_TZ } }, users);
    assert.equal(one.res.statusCode, 200);
    const byId = await call("getOneU", ADMIN_USER, { params: { tz: "b1" } }, users);
    assert.equal(byId.res.statusCode, 200);
  });
});

/* ================= pre-fix A: another user's email ================= */

test("changing another user's email needs users.passwords; the rest of the edit still applies", async () => {
  const plainAdmin = await call("putU", ADMIN_USER, {
    params: { tz: GUIDE_USER.tz }, body: { email: "attacker@example.test", firstname: "Renamed" },
  });
  assert.equal(plainAdmin.res.statusCode, 200);
  const saved = plainAdmin.users.rooms.active.find((u) => u.tz === GUIDE_USER.tz);
  assert.equal(saved.email, GUIDE_USER.email);
  assert.equal(saved.firstname, "Renamed");

  for (const actor of [KEY_ADMIN, SYS]) {
    const allowed = await call("putU", actor, { params: { tz: GUIDE_USER.tz }, body: { email: "new@example.test" } });
    assert.equal(allowed.res.statusCode, 200);
    assert.equal(allowed.users.rooms.active.find((u) => u.tz === GUIDE_USER.tz).email, "new@example.test");
  }

  // One's own email stays editable without the key.
  const self = await call("putU", GUIDE_USER, { params: { tz: GUIDE_USER.tz }, body: { email: "mine@example.test" } });
  assert.equal(self.res.statusCode, 200);
  assert.equal(self.users.rooms.active.find((u) => u.tz === GUIDE_USER.tz).email, "mine@example.test");
});

/* ================= pre-fix B: a failed existence check ================= */

test("a database error in the tz existence check is a 500, never a new account", async () => {
  const users = createUsers({}, { failGet: true });
  const created = await call("postU", ADMIN_USER, { body: { tz: NEW_TZ, password: "placeholder" } }, users);
  assert.equal(created.res.statusCode, 500);

  const controller = loadUserController(users);
  const out = res();
  await controller.register({ body: { tz: NEW_TZ, password: "placeholder" } }, out);
  assert.equal(out.statusCode, 500);

  assert.equal(users.rooms.active.length + users.rooms.waiting.length + users.rooms.noActive.length, 0);
});

/* ================= reports: what the system writes ================= */

function loadReportController() {
  const reports = [];
  const model = {
    async get(filter = {}) { return { success: true, result: reports.filter((r) => Object.keys(filter).every((k) => String(r[k]) === String(filter[k]))) }; },
    async create(data) { const doc = { _id: `report-${reports.length}`, ...data }; reports.push(doc); return { success: true, result: doc }; },
  };
  const dependencies = {
    ...auditStub().deps,
    "./Report.model.js": { ReportModelDef: model },
    "../../middleware/logger.js": { logWithSource() {} },
    "../../utils/permissions.js": require("../utils/permissions"),
    "../Notification/Notification.controller": {},
    ...require("./helpers/alertEventsStub").noopAlertDeps,
  };
  const filename = path.join(__dirname, "../Entities/Report/Report.controller.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return { controller: module.exports, reports };
}

test("a report created by the system stores createdBy \"system\"; others keep their id", async () => {
  const { controller, reports } = loadReportController();
  const asSystem = { user: { id: SYS._id, tz: SYSTEM_TZ }, actor: actorOf(SYS), body: { info: "x" } };
  await controller.post(asSystem, res());
  assert.equal(reports[0].createdBy, "system");

  const asGuide = { user: { id: GUIDE_USER._id, tz: GUIDE_USER.tz }, actor: actorOf(GUIDE_USER), body: { info: "y" } };
  await controller.post(asGuide, res());
  assert.equal(reports[1].createdBy, GUIDE_USER._id);
  assert.ok(!JSON.stringify(reports).includes(SYSTEM_TZ));
});
