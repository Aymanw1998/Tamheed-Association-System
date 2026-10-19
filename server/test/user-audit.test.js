// User changes reach the central audit log: create, edit, delete, folder
// permissions, approval (waiting -> active) and other room moves.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { actorFor } = require("./helpers/actors");
const { auditStub } = require("./helpers/auditStub");

// Room-aware in-memory UserModelDef (update upserts, like api.js).
function createUsers(seed = {}) {
  const rooms = { active: [], waiting: [], noActive: [], ...structuredClone(seed) };
  let next = 1;
  const matches = (doc, filter) => Object.keys(filter).every((k) => String(doc[k]) === String(filter[k]));
  return {
    collections: { active: "Users" },
    async get(filter = {}, room = "active") {
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
    "../../utils/sendEmail": {},
    "../../utils/jwt": {},
    "../../utils/textEncoding": require("../utils/textEncoding"),
    "../../utils/permissions": require("../utils/permissions"),
    "../../utils/permissionRules": require("../utils/permissionRules"),
    "../../utils/israeliId": require("../utils/israeliId"),
    "../../utils/loginLockout": require("../utils/loginLockout"),
    "../../middleware/logger": { logWithSource() {} },
    "./passwordCrypto": {},
    "../UploadFile/file": {},
    "../Storage/Storage.controller": {
      buildUserStorageFolder: () => "folder",
      ensureUserStorageFolder: async () => {},
      syncStorageViewPermissionsForUser: async () => {},
    },
    "../Notification/Notification.controller": {},
    ...audit.deps,
  };
  const filename = path.join(__dirname, "../Entities/User/User.controller.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    console: { log() {}, warn() {}, error() {} },
    process: { env: {} },
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return { controller: module.exports, audit };
}

const ADMIN = { tz: "100000009", firstname: "Ad", lastname: "Min", roles: ["ادارة"], permissionGrants: ["files.manageAll", "users.changeRole"] };
const req = (extra = {}) => ({ user: { tz: ADMIN.tz, roles: ADMIN.roles }, actor: actorFor(ADMIN), params: {}, query: {}, body: {}, ...extra });
const res = () => ({ statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });

test("creating, editing and deleting a user are recorded with before/after", async () => {
  const users = createUsers();
  const { controller, audit } = loadController(users);

  const created = res();
  await controller.postU(req({ body: { tz: "200000008", password: "placeholder", firstname: "Sam", lastname: "Example" } }), created);
  assert.equal(created.statusCode, 201);
  const id = "200000008"; // users are tracked by ID number: their _id changes when they move rooms
  const [made] = audit.find({ module: "users", action: "create", targetId: id });
  assert.ok(made, "create recorded");
  assert.equal(made.targetType, "user");
  assert.equal(made.targetLabel, "Sam Example");

  const edited = res();
  await controller.putU(req({ params: { tz: "200000008" }, body: { firstname: "Samy" } }), edited);
  assert.equal(edited.statusCode, 200);
  const [update] = audit.find({ module: "users", action: "update", targetId: id });
  assert.equal(update.before.firstname, "Sam");
  assert.equal(update.after.firstname, "Samy");

  await controller.updateStoragePermissions(req({ params: { tz: "200000008" }, body: { storagePermissions: { view: ["a"] } } }), res());
  const [perm] = audit.find({ module: "users", action: "permission_change", targetId: id });
  assert.deepEqual(perm.after.storagePermissions.view, ["a"]);

  const removed = res();
  await controller.deleteU(req({ params: { tz: "200000008", from: "active" } }), removed);
  assert.equal(removed.statusCode, 200);
  const [deleted] = audit.find({ module: "users", action: "delete", targetId: id });
  assert.equal(deleted.before.firstname, "Samy");
  assert.equal(deleted.after, null);
});

test("approving a waiting user is recorded as approve; other room moves as update", async () => {
  const users = createUsers({ waiting: [{ _id: "w1", tz: "300000007", firstname: "New", lastname: "Comer" }] });
  const { controller, audit } = loadController(users);

  const approved = res();
  await controller.changeRoom(req({ params: { tz: "300000007" }, body: { from: "waiting", to: "active", role: "مرشد" } }), approved);
  assert.equal(approved.statusCode, 200);
  const [approve] = audit.find({ module: "users", action: "approve", targetId: "300000007" });
  assert.ok(approve, "approve recorded");
  assert.equal(approve.targetLabel, "New Comer");
  assert.equal(approve.before.room, "waiting");
  assert.equal(approve.after.room, "active");

  await controller.changeRoom(req({ params: { tz: "300000007" }, body: { from: "active", to: "noActive" } }), res());
  const moves = audit.find({ module: "users", action: "update" });
  assert.equal(moves.length, 1);
  assert.equal(moves[0].after.room, "noActive");

  // A refused move records nothing.
  const count = audit.calls.length;
  const missing = res();
  await controller.changeRoom(req({ params: { tz: "999999998" }, body: { from: "waiting", to: "active", role: "مرشد" } }), missing);
  assert.equal(missing.statusCode, 404);
  assert.equal(audit.calls.length, count);
});

test("a password change is recorded, and the stored diff hides both values", async () => {
  const users = createUsers({ active: [{ _id: "u9", tz: "400000006", firstname: "P", lastname: "W", password: "old-placeholder" }] });
  const { controller, audit } = loadController(users);
  // Setting another user's password needs users.passwords.
  const pwAdmin = { ...ADMIN, permissionGrants: [...ADMIN.permissionGrants, "users.passwords"] };
  await controller.putU(req({ actor: actorFor(pwAdmin), params: { tz: "400000006" }, body: { password: "new-placeholder" } }), res());
  assert.equal(users.rooms.active[0].password, "new-placeholder");
  const [update] = audit.find({ module: "users", action: "update", targetId: "400000006" });
  assert.ok(update, "update recorded");
  const { diffChanges } = require("../utils/audit");
  const changes = diffChanges(update.before, update.after);
  assert.deepEqual(changes.password, { before: "***", after: "***" });
  assert.ok(!JSON.stringify(changes).includes("placeholder"));
});

test("putU no longer changes roles or grants; the role endpoint records role_change", async () => {
  const users = createUsers({ active: [{ _id: "u5", tz: "500000004", firstname: "G", lastname: "U", role: "مرشد", roles: ["مرشد"] }] });
  const { controller, audit } = loadController(users);
  await controller.putU(req({ params: { tz: "500000004" }, body: { roles: ["مساعد"], vehiclePermissions: ["view"] } }), res());
  assert.equal(users.rooms.active[0].role, "مرشد");
  assert.equal(audit.find({ action: "role_change" }).length, 0);
  assert.equal(audit.find({ action: "permission_change" }).length, 0);

  await controller.putRole(req({ params: { tz: "500000004" }, body: { role: "مساعد" } }), res());
  const [role] = audit.find({ module: "users", action: "role_change", targetId: "500000004" });
  assert.equal(role.before.role, "مرشد");
  assert.equal(role.after.role, "مساعد");
});
