const assert = require("node:assert/strict");
const test = require("node:test");

const {
  ROLE_DEFAULTS,
  expandKeys,
  effectivePermissions,
  roleDefaults,
  setRoleDefaultsOverride,
  checkRoleDefaults,
  ROLE_DEFAULT_KEYS,
} = require("../utils/permissions");
const { createRoleDefaults } = require("../Entities/It/RoleDefaults.controller");

const ADMIN = "ادارة";
const GUIDE = "مرشد";
const ASSISTANT = "مساعد";

test.afterEach(() => {
  for (const role of [ADMIN, GUIDE, ASSISTANT]) setRoleDefaultsOverride(role, null);
});

test("roleDefaults: the code's set until a stored one replaces it", () => {
  assert.deepEqual([...roleDefaults(GUIDE)].sort(), [...expandKeys(ROLE_DEFAULTS[GUIDE])].sort());
  setRoleDefaultsOverride(GUIDE, ["students.view", "lessons.view"]);
  assert.deepEqual([...roleDefaults(GUIDE)].sort(), ["lessons.view", "students.view"]);
  setRoleDefaultsOverride(GUIDE, null);
  assert.deepEqual([...roleDefaults(GUIDE)].sort(), [...expandKeys(ROLE_DEFAULTS[GUIDE])].sort());
  assert.deepEqual([...roleDefaults("غير معروف")], []);
});

test("effectivePermissions follows the stored defaults; a user's own grants and revokes still apply", () => {
  setRoleDefaultsOverride(ASSISTANT, ["students.view", "vehicles.view"]);
  const set = effectivePermissions({ role: ASSISTANT, permissionGrants: ["lessons.view"], permissionRevokes: ["students.view"] });
  assert.deepEqual([...set].sort(), ["lessons.view", "vehicles.view"]);
});

test("checkRoleDefaults: leaves only, no IT key, no grant-only module, no unknown key", () => {
  assert.deepEqual(checkRoleDefaults(["students", "lessons.view"]).keys.sort(),
    [...expandKeys(["students", "lessons.view"])].sort());
  assert.equal(checkRoleDefaults(["audit.view"]).code, "IT_KEY");
  assert.equal(checkRoleDefaults(["permissions"]).code, "IT_KEY");
  assert.equal(checkRoleDefaults(["sports.view"]).code, "GRANT_ONLY");
  assert.equal(checkRoleDefaults(["nothing.here"]).code, "UNKNOWN_KEY");
  assert.equal(checkRoleDefaults("students").code, "UNKNOWN_KEY");
  for (const key of ROLE_DEFAULT_KEYS) {
    assert.ok(!key.startsWith("sports.") && key !== "audit.view", key);
  }
});

// The controller with an in-memory store, audit and user list.
function setup({ rows = [], users = [] } = {}) {
  const store = new Map(rows.map((r) => [r.role, r]));
  const audits = [];
  const controller = createRoleDefaults({
    model: {
      readAll: async () => [...store.values()],
      write: async (role, data) => { store.set(role, { role, ...data }); },
      remove: async (role) => { store.delete(role); },
    },
    users: async () => users,
    audit: { record: async (req, entry) => { audits.push(entry); } },
    now: () => new Date("2026-11-03T12:00:00Z"),
  });
  return { controller, store, audits };
}

function call(handler, { params = {}, body = {}, actor = { it: true, tz: "100000009", name: "IT" } } = {}) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(data) { resolve({ status: this.statusCode, body: data }); },
    };
    handler({ params, body, actor }, res);
  });
}

test("GET lists the three roles with their defaults, the code's set and how many users hold each", async () => {
  const { controller } = setup({ users: [{ role: GUIDE }, { roles: [GUIDE] }, { role: ADMIN }] });
  const { status, body } = await call(controller.list);
  assert.equal(status, 200);
  assert.deepEqual(body.roles.map((r) => r.role), [ADMIN, GUIDE, ASSISTANT]);
  const guide = body.roles.find((r) => r.role === GUIDE);
  assert.equal(guide.users, 2);
  assert.equal(guide.custom, false);
  assert.deepEqual(guide.defaults.sort(), [...expandKeys(ROLE_DEFAULTS[GUIDE])].sort());
  assert.deepEqual(guide.original.sort(), guide.defaults.sort());
  assert.ok(body.grantable.includes("students.edit"));
  assert.ok(!body.grantable.includes("audit.view"));
});

test("PUT saves a role's defaults, takes effect at once and is recorded", async () => {
  const { controller, store, audits } = setup();
  const { status, body } = await call(controller.save, { params: { role: GUIDE }, body: { keys: ["students", "lessons.view"] } });
  assert.equal(status, 200);
  assert.equal(body.role.custom, true);
  assert.equal(body.role.updatedBy, "IT");
  assert.ok(store.get(GUIDE).keys.includes("students.edit"));
  assert.ok(roleDefaults(GUIDE).has("students.edit"));
  assert.ok(!roleDefaults(GUIDE).has("ai.use"));
  assert.equal(audits.length, 1);
  assert.equal(audits[0].module, "permissions");
  assert.equal(audits[0].action, "role_defaults_change");
  assert.equal(audits[0].targetLabel, GUIDE);
});

test("PUT refuses an IT key, a grant-only module and an unknown role", async () => {
  const { controller, store } = setup();
  assert.equal((await call(controller.save, { params: { role: GUIDE }, body: { keys: ["users.passwords"] } })).body.code, "IT_KEY");
  assert.equal((await call(controller.save, { params: { role: GUIDE }, body: { keys: ["sports"] } })).body.code, "GRANT_ONLY");
  const unknown = await call(controller.save, { params: { role: "مدير" }, body: { keys: [] } });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.code, "UNKNOWN_ROLE");
  assert.equal(store.size, 0);
});

test("DELETE returns a role to the code's defaults", async () => {
  const { controller, store, audits } = setup();
  await call(controller.save, { params: { role: ASSISTANT }, body: { keys: ["students.view"] } });
  const { status, body } = await call(controller.reset, { params: { role: ASSISTANT } });
  assert.equal(status, 200);
  assert.equal(body.role.custom, false);
  assert.equal(store.has(ASSISTANT), false);
  assert.deepEqual([...roleDefaults(ASSISTANT)].sort(), [...expandKeys(ROLE_DEFAULTS[ASSISTANT])].sort());
  assert.equal(audits.at(-1).action, "role_defaults_reset");
});

test("load: stored rows become the defaults at start; a bad stored key is dropped", async () => {
  const { controller } = setup({ rows: [{ role: GUIDE, keys: ["students.view", "audit.view", "nothing.here"] }] });
  await controller.load();
  assert.deepEqual([...roleDefaults(GUIDE)], ["students.view"]);
});
