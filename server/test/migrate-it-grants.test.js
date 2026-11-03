const assert = require("node:assert/strict");
const test = require("node:test");

const { findItGrants, clearItGrants } = require("../scripts/migrateItGrants");

const SYSTEM_TZ = "900000001";
process.env.SYSTEM_ADMIN_TZ = SYSTEM_TZ;

const users = () => [
  { tz: "111111110", room: "active", permissionGrants: ["audit.view", "lessons.view"], permissionRevokes: [] },
  { tz: "111111111", room: "noActive", permissionGrants: ["permissions", "sports"], permissionRevokes: ["users.unlock", "reports.create"] },
  { tz: "111111112", room: "waiting", permissionGrants: ["users"], permissionRevokes: [] },
  { tz: "111111113", room: "active", permissionGrants: ["lessons.view"], permissionRevokes: ["students.view"] },
  { tz: SYSTEM_TZ, room: "active", permissionGrants: ["audit.view"], permissionRevokes: [] },
];

test("stored IT-key grants are listed, and --apply removes only those keys", async () => {
  const found = findItGrants(users());
  assert.deepEqual(found, [
    { tz: "111111110", room: "active", keys: ["audit.view"] },
    { tz: "111111111", room: "noActive", keys: ["permissions", "users.unlock"] },
    { tz: "111111112", room: "waiting", keys: ["users"] },
  ]);

  const updates = [];
  const rows = [];
  const model = { async updateExisting(filter, data, room) { updates.push({ filter, data, room }); return { success: true, result: { tz: filter.tz } }; } };
  const audit = { async record(req, row) { rows.push({ req, row }); } };

  const result = await clearItGrants(users(), { model, audit, apply: true });
  assert.equal(result.changed, 3);

  const byTz = Object.fromEntries(updates.map((u) => [u.filter.tz, u]));
  assert.deepEqual(Object.keys(byTz).sort(), ["111111110", "111111111", "111111112"]);
  assert.equal(byTz["111111110"].room, "active");
  assert.deepEqual(byTz["111111110"].data, { permissionGrants: ["lessons.view"], permissionRevokes: [] });
  assert.equal(byTz["111111111"].room, "noActive");
  assert.deepEqual(byTz["111111111"].data, { permissionGrants: ["sports"], permissionRevokes: ["reports.create"] });
  // A module key that also holds everyday leaves keeps them.
  assert.equal(byTz["111111112"].room, "waiting");
  assert.ok(byTz["111111112"].data.permissionGrants.includes("users.view"));
  assert.ok(!byTz["111111112"].data.permissionGrants.includes("users.passwords"));
  assert.ok(!byTz["111111112"].data.permissionGrants.includes("users.unlock"));

  // One audit row per changed user, by the system.
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.row.targetId).sort(), ["111111110", "111111111", "111111112"]);
  for (const { req, row } of rows) {
    assert.equal(req.actor.isSystem, true);
    assert.equal(row.module, "users");
    assert.equal(row.action, "it_grants_cleared");
    assert.equal(row.targetType, "user");
  }
});

test("a dry run changes nothing and a clean set needs no write", async () => {
  const model = { async updateExisting() { throw new Error("must not write"); } };
  const audit = { async record() { throw new Error("must not audit"); } };
  const result = await clearItGrants(users(), { model, audit });
  assert.equal(result.changed, 0);
  assert.equal(result.found.length, 3);
  assert.deepEqual(findItGrants([users()[3]]), []);
});

test("a user who no longer exists is skipped: reported, no audit row, never created", async () => {
  const rows = [];
  const model = {
    update() { throw new Error("must not upsert"); },
    async updateExisting(filter) { return { success: true, result: filter.tz === "111111111" ? null : { tz: filter.tz } }; },
  };
  const audit = { async record(req, row) { rows.push(row); } };
  const result = await clearItGrants(users(), { model, audit, apply: true });
  assert.equal(result.changed, 2);
  assert.deepEqual(result.skipped, [{ tz: "111111111", room: "noActive" }]);
  assert.deepEqual(rows.map((r) => r.targetId).sort(), ["111111110", "111111112"]);
});
