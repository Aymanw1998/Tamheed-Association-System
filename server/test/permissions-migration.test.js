const assert = require("node:assert/strict");
const test = require("node:test");

const { planUserMigration, migrateUsers, formatRow, exitCode } = require("../scripts/migratePermissions");

const ADMIN = "ادارة";
const GUIDE = "مرشد";

function stubModel(rooms) {
  const updates = [];
  return {
    updates,
    async get(filter, room) {
      return { success: true, result: rooms[room] || [] };
    },
    async update(filter, data, room) { updates.push([filter, data, room]); return { success: true }; },
  };
}

test("highest role wins and extra roles produce a warning", () => {
  const plan = planUserMigration({ roles: [GUIDE, "الإدارة"] });
  assert.equal(plan.role, ADMIN);
  assert.deepEqual(plan.roles, [ADMIN]);
  assert.ok(plan.warnings.length >= 1);
});

test("guide vehicle permissions become grants, bogus ones dropped", () => {
  const plan = planUserMigration({ roles: [GUIDE], vehiclePermissions: ["view", "edit", "bogus"] });
  assert.deepEqual(plan.permissionGrants, ["vehicles.view", "vehicles.edit"]);
  assert.deepEqual(plan.permissionRevokes, []);
});

test("admin gets no vehicle grants", () => {
  const plan = planUserMigration({ roles: [ADMIN], vehiclePermissions: ["view", "edit"] });
  assert.deepEqual(plan.permissionGrants, []);
});

test("no roles gives null role and a warning", () => {
  const plan = planUserMigration({ roles: [] });
  assert.equal(plan.role, null);
  assert.deepEqual(plan.roles, []);
  assert.ok(plan.warnings.length >= 1);
});

test("unknown role warns", () => {
  const plan = planUserMigration({ roles: ["nonsense"] });
  assert.equal(plan.role, null);
  assert.ok(plan.warnings.some((w) => /unknown/i.test(w)));
});

test("already-migrated user is unchanged (idempotent)", () => {
  const first = planUserMigration({ roles: [GUIDE, ADMIN], vehiclePermissions: [] });
  const second = planUserMigration({ ...first, vehiclePermissions: [] });
  assert.deepEqual({ ...second, warnings: [] }, { ...first, warnings: [] });
  assert.deepEqual(second.warnings, []);
});

test("dry run writes nothing and reports before/after counts", async () => {
  const model = stubModel({ active: [{ tz: "T1", roles: [GUIDE], vehiclePermissions: ["view"] }] });
  const result = await migrateUsers(model, { apply: false, systemTz: "SYS" });
  assert.equal(model.updates.length, 0);
  assert.equal(result.rows[0].before, result.rows[0].after);
  assert.equal(result.errors, 0);
});

test("apply writes all three rooms and skips unchanged users", async () => {
  const model = stubModel({
    active: [{ tz: "T1", roles: [GUIDE] }],
    waiting: [{ tz: "T2", roles: ["مساعد"] }],
    noActive: [{ tz: "T3", role: GUIDE, roles: [GUIDE], permissionGrants: [], permissionRevokes: [] }],
  });
  const result = await migrateUsers(model, { apply: true, systemTz: "SYS" });
  assert.equal(result.errors, 0);
  assert.deepEqual(model.updates.map((u) => [u[0].tz, u[2]]), [["T1", "active"], ["T2", "waiting"]]);
  assert.equal(model.updates[0][1].role, GUIDE);
});

test("system account only gets role", async () => {
  const model = stubModel({ active: [{ tz: "SYS", roles: [], vehiclePermissions: ["view"] }] });
  await migrateUsers(model, { apply: true, systemTz: "SYS" });
  assert.deepEqual(model.updates, [[{ tz: "SYS" }, { role: ADMIN }, "active"]]);
});

test("a before/after mismatch is an error and the user is not written", async () => {
  const model = stubModel({ active: [{ tz: "T1", roles: [GUIDE], permissionRevokes: ["students.view"] }] });
  const result = await migrateUsers(model, { apply: true, systemTz: "SYS" });
  assert.equal(result.errors, 1);
  assert.equal(model.updates.length, 0);
});

test("formatRow is a printable line", () => {
  assert.equal(typeof formatRow({ tz: "T", oldRoles: [], role: null, grants: [], before: 0, after: 0, warnings: [], error: false }), "string");
});

test("migrated user with later grant and revoke: re-run has no write and no error", async () => {
  const model = stubModel({ active: [{ tz: "T1", role: GUIDE, roles: [GUIDE],
    permissionGrants: ["vehicles.view"], permissionRevokes: ["students.edit"] }] });
  const result = await migrateUsers(model, { apply: true, systemTz: "SYS" });
  assert.equal(result.errors, 0);
  assert.equal(model.updates.length, 0);
});

test("migrated user with stale roles only gets roles aligned", async () => {
  const model = stubModel({ active: [{ tz: "T1", role: GUIDE, roles: [GUIDE, "مساعد"], permissionRevokes: ["students.edit"] }] });
  await migrateUsers(model, { apply: true, systemTz: "SYS" });
  assert.deepEqual(model.updates, [[{ tz: "T1" }, { role: GUIDE, roles: [GUIDE] }, "active"]]);
});

test("unresolvable role leaves raw roles untouched", async () => {
  const plan = planUserMigration({ roles: ["nonsense"] });
  assert.deepEqual(plan.roles, ["nonsense"]);
  const model = stubModel({ active: [{ tz: "T1", roles: ["nonsense"] }] });
  await migrateUsers(model, { apply: true, systemTz: "SYS" });
  assert.ok(model.updates.every((u) => u[1].roles === undefined || u[1].roles[0] === "nonsense"));
});

test("existing grants are preserved through migrateUsers", async () => {
  const model = stubModel({ active: [{ tz: "T1", roles: [GUIDE], permissionGrants: ["vehicles.view"], vehiclePermissions: ["view", "edit"] }] });
  const result = await migrateUsers(model, { apply: true, systemTz: "SYS" });
  assert.equal(result.errors, 0);
  const written = model.updates[0]?.[1];
  assert.deepEqual(written?.permissionGrants, ["vehicles.view", "vehicles.edit"]);
});

test("misencoded role string resolves", () => {
  const garbled = Buffer.from(GUIDE, "utf8").toString("latin1");
  const plan = planUserMigration({ roles: [garbled] });
  assert.equal(plan.role, GUIDE);
});

test("exit code: only --apply with errors is non-zero", () => {
  assert.equal(exitCode({ apply: true, errors: 1 }), 1);
  assert.equal(exitCode({ apply: false, errors: 1 }), 0);
  assert.equal(exitCode({ apply: true, errors: 0 }), 0);
});

test("legacy vehiclePermissions never yield vehicles.delete, even all five plus a stray delete", () => {
  const plan = planUserMigration({ tz: "T9", roles: [GUIDE],
    vehiclePermissions: ["view", "edit", "compliance", "documents", "archive", "delete"] });
  assert.deepEqual(plan.permissionGrants,
    ["vehicles.view", "vehicles.edit", "vehicles.compliance", "vehicles.documents", "vehicles.archive"]);
});

test("the summary counts users with no or unknown role separately", async () => {
  const { formatSummary } = require("../scripts/migratePermissions");
  const model = stubModel({
    active: [{ tz: "u-a", roles: [] }, { tz: "u-b", roles: ["nonsense"] }, { tz: "u-c", roles: [GUIDE] }],
    waiting: [{ tz: "u-d" }],
    noActive: [{ tz: "u-e", role: GUIDE, roles: [GUIDE] }, { tz: "SYS", roles: [] }],
  });
  const result = await migrateUsers(model, { apply: false, systemTz: "SYS" });
  const lines = formatSummary({ ...result, apply: false });
  const text = lines.join("\n");
  assert.match(text, /6 users, 0 errors/);
  const noRole = lines.find((line) => /users have no or unknown role/.test(line));
  assert.ok(noRole, text);
  assert.match(noRole, /^3 users /);
  // The system account is never counted as missing a role.
  assert.ok(!lines.some((line) => line.includes("SYS")));
});

test("the summary says so when every user has a role", () => {
  const { formatSummary } = require("../scripts/migratePermissions");
  const lines = formatSummary({ rows: [{ tz: "u-a", room: "active", system: false, role: GUIDE }], errors: 0, apply: true });
  assert.ok(lines.some((line) => /0 users have no or unknown role/.test(line)));
});
