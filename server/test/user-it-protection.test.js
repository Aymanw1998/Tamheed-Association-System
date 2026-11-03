// Everyday routes follow the IT rules: an administrator resets the password of
// a lower rank, never touches an IT user's account, and cannot read passwords.
const assert = require("node:assert/strict");
const live = require("./helpers/liveStubs");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { actorFor } = require("./helpers/actors");
const { auditStub } = require("./helpers/auditStub");
const { can } = require("../utils/permissions");
const { canResetPassword } = require("../utils/permissionRules");

// Room-aware in-memory UserModelDef (same shape as user-audit.test.js).
function createUsers(seed = {}) {
  const rooms = { active: [], waiting: [], noActive: [], ...structuredClone(seed) };
  const matches = (doc, filter) => Object.keys(filter).every((k) => (filter[k] == null ? doc[k] == null : String(doc[k]) === String(filter[k])));
  return {
    collections: { active: "Users" },
    async get(filter = {}, room = "active") {
      const result = rooms[room].filter((d) => matches(d, filter)).map((d) => structuredClone(d));
      return { success: true, count: result.length, result };
    },
    async create(data, room = "active") {
      const doc = { _id: `user-${rooms[room].length + 1}`, ...structuredClone(data) };
      rooms[room].push(doc);
      return { success: true, result: structuredClone(doc) };
    },
    async update(filter, data, room = "active") {
      const hit = rooms[room].find((d) => matches(d, filter));
      if (hit) Object.assign(hit, structuredClone(data));
      return { success: true, result: hit ? structuredClone(hit) : null };
    },
    async updateExisting(filter, data, room = "active") { return this.update(filter, data, room); },
    async delete(filter, room = "active") {
      const before = rooms[room].length;
      rooms[room] = rooms[room].filter((d) => !matches(d, filter));
      return { success: true, result: { deletedCount: before - rooms[room].length } };
    },
    rooms,
  };
}

function loadController(users) {
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
      buildUserStorageFolder: () => "folder",
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
    process: { env: {} },
    require(name) {
      if (!Object.hasOwn(dependencies, name) && Object.hasOwn(live.deps, name)) return live.deps[name];
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return { controller: module.exports, audit };
}

// Synthetic accounts; the IT user is stored with isIT: true.
const ADMIN = { _id: "a1", tz: "100000009", firstname: "Ad", lastname: "Min", roles: ["ادارة"] };
const GUIDE = { _id: "g1", tz: "200000008", firstname: "Gu", lastname: "Ide", roles: ["مرشد"], password: "old-placeholder", email: "guide@example.test" };
const IT_GUIDE = { _id: "i1", tz: "300000007", firstname: "It", lastname: "Guide", roles: ["مرشد"], password: "it-placeholder", email: "it@example.test", isIT: true };
const ADMIN_2 = { _id: "a2", tz: "400000006", firstname: "Ad", lastname: "Two", roles: ["ادارة"], password: "adm-placeholder" };

const req = (extra = {}) => ({ user: { tz: ADMIN.tz, roles: ADMIN.roles }, actor: actorFor(ADMIN), params: {}, query: {}, body: {}, ...extra });
const res = () => ({ statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });
const seed = () => ({ active: [structuredClone(GUIDE), structuredClone(IT_GUIDE), structuredClone(ADMIN_2)] });

test("an administrator resets the password of a guide", async () => {
  const users = createUsers(seed());
  const { controller } = loadController(users);
  const out = res();
  await controller.putU(req({ params: { tz: GUIDE.tz }, body: { password: "new-placeholder" } }), out);
  assert.equal(out.statusCode, 200);
  const stored = users.rooms.active.find((u) => u.tz === GUIDE.tz);
  assert.equal(stored.password, "new-placeholder");
  assert.ok(stored.passwordChangedAt, "the guide's sessions end");
});

test("an administrator cannot reset the password of an administrator (equal rank)", async () => {
  const users = createUsers(seed());
  const { controller } = loadController(users);
  const out = res();
  await controller.putU(req({ params: { tz: ADMIN_2.tz }, body: { password: "new-placeholder" } }), out);
  assert.equal(out.statusCode, 403);
  assert.equal(users.rooms.active.find((u) => u.tz === ADMIN_2.tz).password, "adm-placeholder");
});

test("without users.resetPassword the password and email of a guide are ignored", async () => {
  const users = createUsers(seed());
  const { controller } = loadController(users);
  const actor = actorFor(ADMIN);
  actor.permissions = new Set([...actor.permissions].filter((k) => k !== "users.resetPassword"));
  const out = res();
  await controller.putU(req({ actor, params: { tz: GUIDE.tz }, body: { firstname: "Gus", password: "new-placeholder", email: "other@example.test" } }), out);
  assert.equal(out.statusCode, 200);
  const stored = users.rooms.active.find((u) => u.tz === GUIDE.tz);
  assert.equal(stored.firstname, "Gus");
  assert.equal(stored.password, "old-placeholder");
  assert.equal(stored.email, "guide@example.test");
});

test("an administrator cannot touch an IT user's account", async () => {
  const users = createUsers(seed());
  const { controller, audit } = loadController(users);
  const before = structuredClone(users.rooms.active);
  const attempts = [
    ["putU", { params: { tz: IT_GUIDE.tz }, body: { firstname: "Changed" } }],
    ["putU", { params: { tz: IT_GUIDE.tz }, body: { email: "attacker@example.test" } }],
    ["putU", { params: { tz: IT_GUIDE.tz }, body: { password: "new-placeholder" } }],
    ["putRole", { params: { tz: IT_GUIDE.tz }, body: { role: "مساعد" } }],
    ["changeRoom", { params: { tz: IT_GUIDE.tz }, body: { from: "active", to: "noActive" } }],
    ["deleteU", { params: { tz: IT_GUIDE.tz, from: "active" } }],
    ["signOutEverywhere", { params: { tz: IT_GUIDE.tz } }],
    ["updateStoragePermissions", { params: { tz: IT_GUIDE.tz }, body: { storagePermissions: { view: ["a"] } } }],
  ];
  for (const [name, extra] of attempts) {
    const out = res();
    await controller[name](req(extra), out);
    assert.equal(out.statusCode, 403, `${name} ${JSON.stringify(extra.body || {})}`);
  }
  assert.deepEqual(users.rooms.active, before, "the IT record is unchanged");
  assert.equal(audit.calls.length, 0, "nothing recorded");
});

test("the IT shield reads the target through the controller's own lookup (isIT survives)", async () => {
  // A waiting IT account is reached through the same lookup: still refused.
  const users = createUsers({ waiting: [{ ...structuredClone(IT_GUIDE), _id: "iw" }] });
  const { controller } = loadController(users);
  const out = res();
  await controller.deleteU(req({ params: { tz: IT_GUIDE.tz, from: "waiting" } }), out);
  assert.equal(out.statusCode, 403);
  assert.equal(users.rooms.waiting.length, 1);
  const role = res();
  await controller.putRole(req({ params: { tz: IT_GUIDE.tz }, body: { role: "مساعد" } }), role);
  assert.equal(role.statusCode, 403);
});

test("the everyday system account passes canResetPassword for a non-IT user, administrator included", () => {
  const system = actorFor({ tz: "000000026", roles: [] }, { isSystem: true });
  assert.equal(canResetPassword(system, GUIDE), true);
  assert.equal(canResetPassword(system, ADMIN_2), true);
  assert.equal(canResetPassword(system, IT_GUIDE), false, "an IT target needs the IT site");
});

test("viewPassword is refused to everyday actors: no everyday actor holds users.passwords and the route is gone", () => {
  assert.equal(can(actorFor(ADMIN), "users.passwords"), false);
  assert.equal(can(actorFor({ tz: "000000026", roles: [] }, { isSystem: true }), "users.passwords"), false);
  const source = fs.readFileSync(path.join(__dirname, "../Entities/User/User.route.js"), "utf8")
    .split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
  for (const gone of ["viewPassword", "/permissions", "/unlock", "/system/recover"]) {
    assert.ok(!source.includes(gone), `${gone} is not mounted in the everyday router`);
  }
  // The handlers stay exported for the IT router.
  const { controller } = loadController(createUsers());
  for (const name of ["viewPassword", "getPermissions", "putPermissions", "unlockUser", "recoverSystem"]) {
    assert.equal(typeof controller[name], "function", name);
  }
});
