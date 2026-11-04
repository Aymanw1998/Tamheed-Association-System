// Administrators run the staff (owner, 2026-11-04), while IT's switch is on.
const assert = require("node:assert/strict");
const test = require("node:test");
const { actorFor } = require("./helpers/actors");
const rules = require("../utils/permissionRules");
const { effectivePermissions } = require("../utils/permissions");

const { canAssignRole, canManageTarget, grantableBy, setAdminPowers, adminPowersOn, isAdminWithPowers, validatePermissionChange } = rules;

process.env.SYSTEM_ADMIN_TZ = "000000026";

const ADMIN = "ادارة";
const GUIDE = "مرشد";
const admin = (extra = {}) => actorFor({ _id: "a1", tz: "admin-1", role: ADMIN, roles: [ADMIN], ...extra });
const guideUser = { _id: "g1", tz: "guide-1", role: GUIDE, roles: [GUIDE] };
const otherAdmin = { _id: "a2", tz: "admin-2", role: ADMIN, roles: [ADMIN] };

test.afterEach(() => setAdminPowers(true));

test("the switch starts on", () => {
  assert.equal(adminPowersOn(), true);
  assert.equal(isAdminWithPowers(admin()), true);
  assert.equal(isAdminWithPowers(actorFor(guideUser)), false);
});

test("an administrator gives ادارة to a new user and to a lower-ranked user", () => {
  assert.equal(canAssignRole(admin(), {}, ADMIN), true);
  assert.equal(canAssignRole(admin(), guideUser, ADMIN), true);
});

test("an administrator never touches another administrator's account", () => {
  assert.equal(canManageTarget(admin(), otherAdmin), false);
  assert.equal(canAssignRole(admin(), otherAdmin, GUIDE), false);
});

test("a guide with users.create still cannot give ادارة", () => {
  const guide = actorFor({ ...guideUser, permissionGrants: ["users.create", "users.changeRole"] });
  assert.equal(canAssignRole(guide, {}, ADMIN), false);
});

test("an administrator grants keys he holds, and sports, to a user below him", () => {
  assert.equal(validatePermissionChange(admin(), guideUser, { grants: ["vehicles.edit"] }).ok, true);
  assert.equal(validatePermissionChange(admin(), guideUser, { grants: ["sports.coach"] }).ok, true);
});

test("an administrator does not grant a key he lacks, a finance key or an IT key", () => {
  assert.equal(validatePermissionChange(admin(), guideUser, { grants: ["finance.view"] }).code, "NOT_GRANTABLE");
  assert.equal(validatePermissionChange(admin(), guideUser, { grants: ["audit.view"] }).code, "NOT_GRANTABLE");
  const revoked = admin({ permissionRevokes: ["vehicles.edit"] });
  assert.equal(validatePermissionChange(revoked, guideUser, { grants: ["vehicles.edit"] }).code, "NOT_GRANTABLE");
});

test("an administrator does not change himself, another administrator or an IT user", () => {
  const me = admin();
  assert.equal(validatePermissionChange(me, me.user, { grants: [] }).code, "SELF");
  assert.equal(validatePermissionChange(me, otherAdmin, { grants: [] }).code, "FORBIDDEN");
  assert.equal(validatePermissionChange(me, { ...guideUser, isIT: true }, { grants: [] }).code, "FORBIDDEN");
});

test("grantableBy for an administrator holds no IT key and includes sports", () => {
  const set = grantableBy(admin());
  assert.ok(set.has("sports.manage"));
  assert.ok(set.has("students.edit"));
  assert.ok(!set.has("permissions.manage"));
  assert.ok(!set.has("finance.view"));
});

test("with the switch off the old rules return, and given permissions stay", () => {
  setAdminPowers(false);
  assert.equal(isAdminWithPowers(admin()), false);
  assert.equal(canAssignRole(admin(), {}, ADMIN), false);
  assert.equal(canAssignRole(admin(), {}, GUIDE), true);
  assert.equal(validatePermissionChange(admin(), guideUser, { grants: ["vehicles.edit"] }).code, "FORBIDDEN");
  assert.equal(grantableBy(admin()).size, 0);
  assert.ok(effectivePermissions({ ...guideUser, permissionGrants: ["vehicles.edit"] }).has("vehicles.edit"));
});

test("the IT actor's rules do not change", () => {
  const it = { ...actorFor({ ...guideUser, isIT: true }), it: true };
  assert.equal(validatePermissionChange(it, otherAdmin, { grants: ["finance.view"] }).ok, true);
  assert.equal(isAdminWithPowers({ ...admin(), it: true }), false);
});
