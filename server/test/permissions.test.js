const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PERMISSION_TREE,
  ROLE_RANK,
  ROLE_DEFAULTS,
  DANGEROUS_KEYS,
  GRANT_ONLY_MODULES,
  ALL_KEYS,
  normalizeRole,
  expandKeys,
  effectivePermissions,
  can,
  isSystemTz,
} = require("../utils/permissions");

const ADMIN = "ادارة";
const GUIDE = "مرشد";
const ASSISTANT = "مساعد";

test("normalizeRole maps spellings, trims and repairs mojibake", () => {
  assert.equal(normalizeRole("الإدارة"), ADMIN);
  assert.equal(normalizeRole(" إدارة "), ADMIN);
  assert.equal(normalizeRole("الادارة"), ADMIN);
  assert.equal(normalizeRole(Buffer.from(ADMIN, "utf8").toString("latin1")), ADMIN);
  assert.equal(normalizeRole("المرشدة"), GUIDE);
  assert.equal(normalizeRole("مرشدة"), GUIDE);
  assert.equal(normalizeRole("المرشد"), GUIDE);
  assert.equal(normalizeRole(ASSISTANT), ASSISTANT);
  assert.equal(normalizeRole("x"), null);
  assert.equal(normalizeRole(undefined), null);
});

test("constants have the expected shape", () => {
  assert.deepEqual(ROLE_RANK, { [ADMIN]: 3, [GUIDE]: 2, [ASSISTANT]: 1 });
  assert.deepEqual([...GRANT_ONLY_MODULES].sort(), ["finance", "sports"]);
  assert.deepEqual(
    [...DANGEROUS_KEYS].sort(),
    ["audit.view", "permissions.manage", "systemRecovery.reset", "users.changeRole", "users.passwords", "users.unlock"],
  );
  assert.equal(ALL_KEYS.length, Object.values(PERMISSION_TREE).flat().length);
  assert.ok(ALL_KEYS.includes("students.viewAll"));
});

test("admin defaults include broad keys and exclude dangerous and grant-only", () => {
  const set = effectivePermissions({ role: ADMIN });
  for (const key of ["students.viewAll", "lessons.viewAll", "files.manageAll", "users.delete"]) assert.ok(set.has(key), key);
  for (const key of DANGEROUS_KEYS) assert.ok(!set.has(key), key);
  assert.ok(!set.has("sports.view"));
  assert.ok(!set.has("finance.view"));
});

test("guide defaults", () => {
  const set = effectivePermissions({ role: GUIDE });
  assert.ok(set.has("students.view"));
  assert.ok(!set.has("students.viewAll"));
  assert.ok(!set.has("lessons.delete"));
  assert.ok(!set.has("lessons.viewAll"));
  assert.ok(set.has("attendance.record"));
});

test("grants add and revokes remove", () => {
  const set = effectivePermissions({
    role: GUIDE,
    permissionGrants: ["sports"],
    permissionRevokes: ["students.edit"],
  });
  assert.ok(set.has("sports.view"));
  assert.ok(!set.has("students.edit"));
});

test("revoking a module beats a granted leaf", () => {
  const set = effectivePermissions({
    role: GUIDE,
    permissionGrants: ["students.photo"],
    permissionRevokes: ["students"],
  });
  assert.equal([...set].filter((k) => k.startsWith("students.")).length, 0);
});

test("system gets every leaf", () => {
  assert.equal(effectivePermissions({}, { isSystem: true }).size, ALL_KEYS.length);
  assert.equal(effectivePermissions({ role: ASSISTANT }, { isSystem: true }).size, ALL_KEYS.length);
});

test("role falls back to the highest of roles[]", () => {
  const set = effectivePermissions({ roles: [GUIDE, "الادارة"] });
  assert.ok(set.has("users.delete"));
  assert.ok(set.has("students.viewAll"));
});

test("unknown role yields no defaults; unknown keys are dropped", () => {
  assert.equal(effectivePermissions({ role: "x" }).size, 0);
  assert.deepEqual([...expandKeys(["nope", "ai", "x.y"])], ["ai.use"]);
  assert.equal(expandKeys(["students"]).size, PERMISSION_TREE.students.length);
});

test("can works on users, sets, and module keys", () => {
  const user = { role: GUIDE };
  assert.equal(can(user, "students.view"), true);
  assert.equal(can(user, "students.delete"), false);
  assert.equal(can(user, "attendance"), true);
  assert.equal(can(user, "students"), false);
  assert.equal(can(effectivePermissions(user), "ai"), true);
  assert.equal(can(null, "ai"), false);
  assert.equal(can(user, "nope"), false);
});

test("isSystemTz trims only the configured value, compares the stored tz exactly, and never matches blanks", () => {
  assert.equal(isSystemTz("", ""), false);
  assert.equal(isSystemTz(" ", undefined), false);
  assert.equal(isSystemTz("123", ""), false);
  assert.equal(isSystemTz("123", " 123 "), true);
  assert.equal(isSystemTz(" 123", "123"), false);
  assert.equal(isSystemTz("123 ", "123 "), false);
  assert.equal(isSystemTz("124", "123"), false);
});

test("resolveRole prefers role, falls back to the highest legacy role", () => {
  const { resolveRole } = require("../utils/permissions");
  assert.equal(resolveRole({ role: "مرشد", roles: ["ادارة"] }), "مرشد");
  assert.equal(resolveRole({ roles: ["مساعد", "الإدارة"] }), "ادارة");
  assert.equal(resolveRole({}), null);
});

test("vehicles has a delete leaf that only the admin role default holds", () => {
  assert.deepEqual(PERMISSION_TREE.vehicles, ["view", "edit", "compliance", "documents", "archive", "delete"]);
  assert.ok(effectivePermissions({ role: "ادارة" }).has("vehicles.delete"));
  assert.ok(!effectivePermissions({ role: "مرشد" }).has("vehicles.delete"));
  assert.ok(!effectivePermissions({ role: "مساعد" }).has("vehicles.delete"));
});

test("can uses an actor's permission Set instead of recomputing from its fields", () => {
  // req.actor carries role/grants under different names; its Set is authoritative.
  const actor = { role: GUIDE, permissions: new Set(["users.view"]) };
  assert.equal(can(actor, "users.view"), true);
  assert.equal(can(actor, "students.view"), false);
  assert.equal(can({ permissions: new Set() }, "ai"), false);
});

test("the system account ignores permissionRevokes", () => {
  const set = effectivePermissions({ role: ASSISTANT, permissionRevokes: ["users", "ai"] }, { isSystem: true });
  assert.equal(set.size, ALL_KEYS.length);
  assert.ok(set.has("users.view") && set.has("ai.use"));
});

test("grant-only and dangerous keys can be granted through permissionGrants", () => {
  const user = { role: GUIDE, permissionGrants: ["sports", "users.passwords"] };
  assert.equal(can(user, "sports.view"), true);
  assert.equal(can(user, "users.passwords"), true);
  assert.equal(can({ role: ADMIN }, "users.passwords"), false);
});

test("assistant spelling variants normalize to the assistant role", () => {
  for (const spelling of ["مساعد", "مساعدة", "المساعد", "المساعدة", " المساعدة "]) {
    assert.equal(normalizeRole(spelling), ASSISTANT, spelling);
  }
});
