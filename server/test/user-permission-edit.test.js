// The user edit screen still sends legacy `roles` / `vehiclePermissions`;
// putU and postU must turn them into `role` / `permissionGrants`, which is
// what access is computed from after the permissions migration.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { actorFor } = require("./helpers/actors");
const { effectivePermissions } = require("../utils/permissions");
const { planUserMigration, migrateUsers } = require("../scripts/migratePermissions");

const ADMIN = "ادارة";
const GUIDE = "مرشد";
const TARGET = "target-user";

// `stored` is the target user record the stub database holds (or null).
function loadController(stored) {
  const updates = [];
  const created = [];
  const dependencies = {
    bcryptjs: {},
    jsonwebtoken: {},
    path,
    "./User.model": {
      UserModelDef: {
        async get(filter, room) {
          const hit = stored && room === "active" && (filter.tz === stored.tz || filter._id === stored.tz);
          return { success: true, count: hit ? 1 : 0, result: hit ? [stored] : [] };
        },
        async update(filter, data, room) {
          updates.push({ filter, data, room });
          return { success: true };
        },
        async create(data, room) {
          created.push({ data, room });
          return { success: true };
        },
      },
    },
    "../../utils/sendEmail": {},
    "../../utils/jwt": {},
    "../../utils/textEncoding": require("../utils/textEncoding"),
    "../../utils/permissions": require("../utils/permissions"),
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
  };
  const filename = path.join(__dirname, "../Entities/User/User.controller.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return { ...module.exports, updates, created };
}

const fakeRes = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(value) { this.body = value; return this; },
});

const admin = { tz: "admin-user", role: ADMIN, roles: [ADMIN] };
// Copies VM-realm objects into this realm for strict equality.
const plain = (value) => JSON.parse(JSON.stringify(value));

async function put({ stored, body, actorUser = admin }) {
  const ctrl = loadController(stored);
  const res = fakeRes();
  await ctrl.putU({ params: { tz: TARGET }, user: actorUser, actor: actorFor(actorUser), body }, res);
  return { res, updates: plain(ctrl.updates) };
}

async function post({ body, actorUser = admin }) {
  const ctrl = loadController(null);
  const res = fakeRes();
  await ctrl.postU({ user: actorUser, actor: actorFor(actorUser), body }, res);
  return { res, created: plain(ctrl.created) };
}

test("demoting an admin to guide stores role مرشد and clears special permissions", async () => {
  const stored = { tz: TARGET, role: ADMIN, roles: [ADMIN],
    permissionGrants: ["users.passwords"], permissionRevokes: ["ai"] };
  const { res, updates } = await put({ stored, body: { roles: [GUIDE] } });
  assert.equal(res.statusCode, 200);
  assert.equal(updates.length, 1);
  const { data } = updates[0];
  assert.equal(data.role, GUIDE);
  assert.deepEqual(data.roles, [GUIDE]);
  assert.deepEqual(data.permissionGrants, []);
  assert.deepEqual(data.permissionRevokes, []);
  const after = effectivePermissions({ ...stored, ...data });
  assert.ok(!after.has("users.view"));
  assert.ok(!after.has("users.passwords"));
});

test("promoting a guide keeps their special grants", async () => {
  const stored = { tz: TARGET, role: GUIDE, roles: [GUIDE], permissionGrants: ["sports"] };
  const { updates } = await put({ stored, body: { roles: [ADMIN] } });
  const { data } = updates[0];
  assert.equal(data.role, ADMIN);
  assert.deepEqual(data.roles, [ADMIN]);
  assert.equal(data.permissionGrants, undefined);
  const after = effectivePermissions({ ...stored, ...data });
  assert.ok(after.has("sports.view") && after.has("users.view"));
});

test("unticking every vehicle permission removes the vehicle grants and keeps the others", async () => {
  const stored = { tz: TARGET, role: GUIDE, roles: [GUIDE],
    permissionGrants: ["sports", "vehicles.view"], vehiclePermissions: ["view"] };
  const { updates } = await put({ stored, body: { roles: [GUIDE], vehiclePermissions: [] } });
  const { data } = updates[0];
  assert.deepEqual(data.permissionGrants, ["sports"]);
  assert.deepEqual(data.vehiclePermissions, []);
  const after = effectivePermissions({ ...stored, ...data });
  assert.ok([...after].every((key) => !key.startsWith("vehicles.")));
});

test("a demotion plus vehicle ticks in one save ends with exactly the ticked grants", async () => {
  const stored = { tz: TARGET, role: ADMIN, roles: [ADMIN], permissionGrants: ["audit.view"] };
  const { updates } = await put({ stored, body: { roles: [GUIDE], vehiclePermissions: ["view", "edit"] } });
  assert.deepEqual(updates[0].data.permissionGrants, ["vehicles.view", "vehicles.edit"]);
});

test("a role or vehicle change for a user that cannot be found writes nothing", async () => {
  const { res, updates } = await put({ stored: null, body: { roles: [GUIDE] } });
  assert.equal(res.statusCode, 404);
  assert.deepEqual(updates, []);
});

test("creating a guide with a vehicle tick grants vehicles.view", async () => {
  const { res, created } = await post({ body: {
    tz: "new-user", password: "placeholder", storageFolder: "folder",
    roles: [GUIDE], vehiclePermissions: ["view"],
  } });
  assert.equal(res.statusCode, 201);
  const { data } = created[0];
  assert.equal(data.role, GUIDE);
  assert.deepEqual(data.roles, [GUIDE]);
  assert.deepEqual(data.permissionGrants, ["vehicles.view"]);
  assert.ok(effectivePermissions(data).has("vehicles.view"));
});

test("re-running the migration on an edited user changes nothing", async () => {
  const stored = { tz: TARGET, role: ADMIN, roles: [ADMIN], permissionGrants: ["audit.view"] };
  const { updates } = await put({ stored, body: { roles: [GUIDE], vehiclePermissions: ["view"] } });
  const edited = { ...stored, ...updates[0].data };

  const plan = planUserMigration(edited);
  assert.equal(plan.role, edited.role);
  assert.deepEqual(plan.roles, edited.roles);
  assert.deepEqual(plan.permissionGrants, edited.permissionGrants);
  assert.deepEqual(plan.permissionRevokes, edited.permissionRevokes);

  const { created } = await post({ body: {
    tz: "new-user", password: "placeholder", storageFolder: "folder",
    roles: [GUIDE], vehiclePermissions: ["view"],
  } });
  const writes = [];
  const model = {
    async get(filter, room) { return { success: true, result: room === "active" ? [edited, created[0].data] : [] }; },
    async update(...args) { writes.push(args); return { success: true }; },
  };
  const result = await migrateUsers(model, { apply: true, systemTz: "" });
  assert.equal(result.errors, 0);
  assert.deepEqual(writes, []);
});

test("PUT drops storagePermissions unless the actor holds files.manageAll", async () => {
  const stored = { tz: TARGET, role: GUIDE, roles: [GUIDE] };
  const editor = { tz: "editor-user", role: GUIDE, roles: [GUIDE], permissionGrants: ["users.edit"] };
  const body = { firstname: "Updated", storagePermissions: { view: ["*"] } };

  const denied = await put({ stored, body, actorUser: editor });
  assert.equal(denied.res.statusCode, 200);
  assert.deepEqual(denied.updates[0].data, { firstname: "Updated" });

  const allowed = await put({ stored, body });
  assert.deepEqual(allowed.updates[0].data.storagePermissions, { view: ["*"] });
});
