const assert = require("node:assert/strict");
const test = require("node:test");

const { effectivePermissions } = require("../utils/permissions");
const {
  holdsDangerous,
  isPermissionManager,
  canManageTarget,
  grantableBy,
  validatePermissionChange,
  canAssignRole,
  applyRoleChange,
} = require("../utils/permissionRules");

const ADMIN = "ادارة";
const GUIDE = "مرشد";
const ASSISTANT = "مساعد";

// A user record as stored in the database.
function userDoc(id, role, { grants = [], revokes = [] } = {}) {
  return { _id: id, tz: `tz-${id}`, role, roles: [role], permissionGrants: grants, permissionRevokes: revokes };
}

// The shape loadActor puts on req.actor.
function actorOf(doc, { isSystem = false } = {}) {
  return {
    id: String(doc._id),
    tz: doc.tz,
    name: "test",
    role: doc.role,
    grants: doc.permissionGrants,
    revokes: doc.permissionRevokes,
    permissions: effectivePermissions(doc, { isSystem }),
    isSystem,
    user: doc,
  };
}

const systemDoc = userDoc("sys", ADMIN);
const system = actorOf(systemDoc, { isSystem: true });
const adminDoc = userDoc("a1", ADMIN);
const admin = actorOf(adminDoc);
const otherAdmin = userDoc("a2", ADMIN);
const guide = userDoc("g1", GUIDE);
const assistant = userDoc("s1", ASSISTANT);

test("holdsDangerous and isPermissionManager read the effective set", () => {
  assert.equal(holdsDangerous(adminDoc), false);
  assert.equal(holdsDangerous(userDoc("g2", GUIDE, { grants: ["audit.view"] })), true);
  assert.equal(holdsDangerous(system), true);
  assert.equal(holdsDangerous(userDoc("g3", GUIDE, { grants: ["audit.view"], revokes: ["audit"] })), false);
  assert.equal(isPermissionManager(adminDoc), false);
  assert.equal(isPermissionManager(userDoc("g4", GUIDE, { grants: ["permissions.manage"] })), true);
  assert.equal(isPermissionManager(actorOf(userDoc("g5", GUIDE, { grants: ["permissions"] }))), true);
});

test("an admin manages lower ranks only", () => {
  assert.equal(canManageTarget(admin, guide, { isSystemTarget: false }), true);
  assert.equal(canManageTarget(admin, assistant, { isSystemTarget: false }), true);
  assert.equal(canManageTarget(admin, otherAdmin, { isSystemTarget: false }), false);
  assert.equal(canManageTarget(admin, adminDoc, { isSystemTarget: false }), false);
  assert.equal(canManageTarget(admin, systemDoc, { isSystemTarget: true }), false);
  assert.equal(canManageTarget(actorOf(guide), assistant, { isSystemTarget: false }), true);
  assert.equal(canManageTarget(actorOf(guide), guide, { isSystemTarget: false }), false);
});

test("self is detected by id or tz", () => {
  const sameTz = { ...guide, _id: "different" };
  assert.equal(canManageTarget(actorOf(guide), sameTz, {}), false);
});

test("a target holding a dangerous key is managed by the system only", () => {
  const dangerousGuide = userDoc("g6", GUIDE, { grants: ["audit.view"] });
  assert.equal(canManageTarget(admin, dangerousGuide, { isSystemTarget: false }), false);
  assert.equal(canManageTarget(system, dangerousGuide, { isSystemTarget: false }), true);
  assert.equal(canManageTarget(system, otherAdmin, { isSystemTarget: false }), true);
  assert.equal(canManageTarget(system, systemDoc, { isSystemTarget: true }), false);
});

test("grantableBy: system all, manager own set minus dangerous, others nothing", () => {
  assert.ok(grantableBy(system).has("permissions.manage"));
  assert.ok(grantableBy(system).has("audit.view"));
  const manager = actorOf(userDoc("m1", ADMIN, { grants: ["permissions.manage", "audit.view"] }));
  const set = grantableBy(manager);
  assert.ok(set.has("students.view"));
  assert.equal(set.has("permissions.manage"), false);
  assert.equal(set.has("audit.view"), false);
  assert.equal(grantableBy(admin).size, 0);
});

// An admin-rank permission manager who holds only students.view from the
// students module (admin rank keeps a guide target in reach).
const narrowManagerDoc = userDoc("m2", ADMIN, {
  grants: ["permissions.manage"],
  revokes: ["students.viewAll", "students.create", "students.edit", "students.delete",
    "students.photo", "students.parentLink"],
});
const narrowManager = actorOf(narrowManagerDoc);

test("a permission manager grants only what he holds and nothing dangerous", () => {
  const ctx = { isSystemTarget: false };
  assert.deepEqual(validatePermissionChange(narrowManager, guide, { grants: ["students"] }, ctx),
    { ok: false, code: "NOT_GRANTABLE" });
  assert.deepEqual(validatePermissionChange(narrowManager, guide, { grants: ["students.view"] }, ctx),
    { ok: true });
  assert.deepEqual(validatePermissionChange(narrowManager, guide, { grants: ["audit.view"] }, ctx),
    { ok: false, code: "NOT_GRANTABLE" });
  assert.deepEqual(validatePermissionChange(narrowManager, guide, { revokes: ["students.delete"] }, ctx),
    { ok: false, code: "NOT_GRANTABLE" });
  assert.deepEqual(validatePermissionChange(narrowManager, guide, { grants: ["nope.key"] }, ctx),
    { ok: false, code: "UNKNOWN_KEY" });
});

test("a permission manager never touches another manager or himself", () => {
  const ctx = { isSystemTarget: false };
  // permissions.manage is dangerous, so the target is out of reach either way.
  const otherManager = userDoc("m3", GUIDE, { grants: ["permissions.manage"] });
  assert.deepEqual(validatePermissionChange(narrowManager, otherManager, { grants: ["students.view"] }, ctx),
    { ok: false, code: "FORBIDDEN" });
  assert.deepEqual(validatePermissionChange(narrowManager, narrowManagerDoc, { grants: ["students.view"] }, ctx),
    { ok: false, code: "SELF" });
  assert.deepEqual(validatePermissionChange(narrowManager, otherAdmin, { grants: ["students.view"] }, ctx),
    { ok: false, code: "FORBIDDEN" });
  assert.deepEqual(validatePermissionChange(narrowManager, systemDoc, { grants: [] }, { isSystemTarget: true }),
    { ok: false, code: "FORBIDDEN" });
});

test("a non-manager cannot change permissions at all", () => {
  assert.deepEqual(validatePermissionChange(admin, guide, { grants: [] }, { isSystemTarget: false }),
    { ok: false, code: "FORBIDDEN" });
});

test("the system grants anything, including permissions.manage", () => {
  const ctx = { isSystemTarget: false };
  assert.deepEqual(validatePermissionChange(system, guide, { grants: ["permissions.manage"] }, ctx), { ok: true });
  const otherManager = userDoc("m4", ADMIN, { grants: ["permissions.manage"] });
  assert.deepEqual(validatePermissionChange(system, otherManager, { revokes: ["permissions.manage"] }, ctx),
    { ok: true });
  assert.deepEqual(validatePermissionChange(system, systemDoc, { grants: [] }, { isSystemTarget: true }),
    { ok: false, code: "SELF" });
});

test("canAssignRole needs changeRole, every default leaf, and a role strictly below the actor's rank", () => {
  const ctx = { isSystemTarget: false };
  const guideChanger = actorOf(userDoc("c1", GUIDE, { grants: ["users.changeRole"] }));
  assert.equal(canAssignRole(guideChanger, assistant, ADMIN, ctx), false);
  assert.equal(canAssignRole(guideChanger, assistant, GUIDE, ctx), false); // own rank
  assert.equal(canAssignRole(guideChanger, userDoc("n1", null), ASSISTANT, ctx), true);
  assert.equal(canAssignRole(admin, guide, ASSISTANT, ctx), false);
  const adminChanger = actorOf(userDoc("c2", ADMIN, { grants: ["users.changeRole"] }));
  assert.equal(canAssignRole(adminChanger, guide, ADMIN, ctx), false); // own rank
  assert.equal(canAssignRole(adminChanger, guide, ASSISTANT, ctx), true);
  assert.equal(canAssignRole(system, guide, ADMIN, ctx), true); // the system has no rank limit
  assert.equal(canAssignRole(adminChanger, otherAdmin, GUIDE, ctx), false);
  assert.equal(canAssignRole(adminChanger, userDoc("c2", ADMIN), GUIDE, ctx), false);
  assert.equal(canAssignRole(adminChanger, guide, "bogus", ctx), false);
  assert.equal(canAssignRole(system, otherAdmin, ASSISTANT, ctx), true);
  assert.equal(canAssignRole(system, systemDoc, GUIDE, { isSystemTarget: true }), false);
});

test("applyRoleChange keeps grants on promotion and clears them on demotion", () => {
  const demoted = applyRoleChange(userDoc("x1", ADMIN, { grants: ["sports"], revokes: ["files.manageAll"] }), GUIDE);
  assert.deepEqual(demoted, { role: GUIDE, roles: [GUIDE], permissionGrants: [], permissionRevokes: [], demoted: true });
  const promoted = applyRoleChange(userDoc("x2", GUIDE, { grants: ["sports"], revokes: ["ai"] }), ADMIN);
  assert.deepEqual(promoted, { role: ADMIN, roles: [ADMIN], permissionGrants: ["sports"], permissionRevokes: ["ai"], demoted: false });
  const same = applyRoleChange(userDoc("x3", GUIDE, { grants: ["sports"] }), "المرشدة");
  assert.equal(same.role, GUIDE);
  assert.deepEqual(same.permissionGrants, ["sports"]);
  assert.equal(same.demoted, false);
});

/* ---------- Fix round 1 ---------- */

function withSystemTz(tz, fn) {
  const had = Object.hasOwn(process.env, "SYSTEM_ADMIN_TZ");
  const previous = process.env.SYSTEM_ADMIN_TZ;
  process.env.SYSTEM_ADMIN_TZ = tz;
  try { fn(); } finally {
    if (had) process.env.SYSTEM_ADMIN_TZ = previous;
    else delete process.env.SYSTEM_ADMIN_TZ;
  }
}

test("a target whose tz is the system tz is refused even without ctx.isSystemTarget", () => {
  withSystemTz("tz-sys", () => {
    const manager = actorOf(userDoc("m5", ADMIN, { grants: ["permissions.manage"] }));
    const changer = actorOf(userDoc("c3", ADMIN, { grants: ["users.changeRole"] }));
    assert.equal(canManageTarget(admin, systemDoc), false);
    assert.equal(canManageTarget(admin, systemDoc, {}), false);
    assert.deepEqual(validatePermissionChange(manager, systemDoc, { grants: [] }),
      { ok: false, code: "FORBIDDEN" });
    assert.equal(canAssignRole(changer, systemDoc, GUIDE), false);
    // Another system-flagged actor (not self by id/tz) still cannot touch it.
    const otherSystem = { ...system, id: "sys2", tz: "tz-sys2" };
    assert.equal(canManageTarget(otherSystem, systemDoc), false);
  });
});

test("a raw user doc whose tz is the system tz is treated as the system actor", () => {
  withSystemTz("tz-sys", () => {
    const rawSystem = { ...systemDoc };
    assert.equal(canManageTarget(rawSystem, otherAdmin), true);
    assert.ok(grantableBy(rawSystem).has("permissions.manage"));
    assert.equal(holdsDangerous(rawSystem), true);
    assert.deepEqual(validatePermissionChange(rawSystem, guide, { grants: ["audit.view"] }), { ok: true });
    assert.equal(canAssignRole(rawSystem, guide, ADMIN), true);
  });
  // Without the env, the same doc is just an admin.
  withSystemTz("", () => {
    assert.equal(canManageTarget({ ...systemDoc }, otherAdmin), false);
  });
});

test("an explicit req.actor.isSystem flag is trusted over the tz", () => {
  withSystemTz("tz-sys", () => {
    const notSystem = { ...admin, id: "x", tz: "tz-sys", isSystem: false };
    assert.equal(grantableBy(notSystem).size, 0);
  });
});

test("validatePermissionChange tolerates null changes", () => {
  const ctx = { isSystemTarget: false };
  assert.deepEqual(validatePermissionChange(narrowManager, guide, null, ctx), { ok: true });
  assert.deepEqual(validatePermissionChange(narrowManager, guide, undefined, ctx), { ok: true });
});

test("non-array grants or revokes are UNKNOWN_KEY", () => {
  const ctx = { isSystemTarget: false };
  assert.deepEqual(validatePermissionChange(narrowManager, guide, { grants: "students.view" }, ctx),
    { ok: false, code: "UNKNOWN_KEY" });
  assert.deepEqual(validatePermissionChange(narrowManager, guide, { revokes: { a: 1 } }, ctx),
    { ok: false, code: "UNKNOWN_KEY" });
  assert.deepEqual(validatePermissionChange(narrowManager, guide, { grants: [42] }, ctx),
    { ok: false, code: "UNKNOWN_KEY" });
});

test("self is detected despite surrounding whitespace in id or tz", () => {
  const actor = { ...actorOf(guide), id: " g1 " };
  assert.equal(canManageTarget(actor, { ...assistant, _id: "g1" }, {}), false);
  const actorTz = { ...actorOf(guide), id: "zzz", tz: " tz-g1 " };
  assert.equal(canManageTarget(actorTz, { ...assistant, tz: "tz-g1  " }, {}), false);
});

test("a dangerous key held only through a module grant makes the target system-only", () => {
  const ctx = { isSystemTarget: false };
  const viaAudit = userDoc("g7", GUIDE, { grants: ["audit"] });
  const viaPermissions = userDoc("g8", GUIDE, { grants: ["permissions"] });
  assert.equal(canManageTarget(admin, viaAudit, ctx), false);
  assert.equal(canManageTarget(admin, viaPermissions, ctx), false);
  assert.deepEqual(validatePermissionChange(narrowManager, viaPermissions, { grants: [] }, ctx),
    { ok: false, code: "FORBIDDEN" });
  assert.equal(canManageTarget(system, viaAudit, ctx), true);
});

test("a target with no role (rank 0) is manageable by any ranked actor", () => {
  const noRole = { _id: "n1", tz: "tz-n1", permissionGrants: [], permissionRevokes: [] };
  assert.equal(canManageTarget(actorOf(assistant), noRole, {}), true);
  assert.equal(canManageTarget(admin, noRole, {}), true);
});

test("applyRoleChange reads a legacy roles-only target", () => {
  const legacy = { _id: "l1", tz: "tz-l1", roles: ["الإدارة"], permissionGrants: ["sports"], permissionRevokes: [] };
  const out = applyRoleChange(legacy, ASSISTANT);
  assert.deepEqual(out, { role: ASSISTANT, roles: [ASSISTANT], permissionGrants: [], permissionRevokes: [], demoted: true });
  const legacyGuide = { roles: ["مرشدة"], permissionGrants: ["sports"] };
  assert.deepEqual(applyRoleChange(legacyGuide, ADMIN).permissionGrants, ["sports"]);
});

test("applyRoleChange to no role is a demotion that clears grants", () => {
  const out = applyRoleChange(userDoc("x4", GUIDE, { grants: ["sports"], revokes: ["ai"] }), null);
  assert.deepEqual(out, { role: null, roles: [], permissionGrants: [], permissionRevokes: [], demoted: true });
});

test("applyRoleChange throws UNKNOWN_ROLE for an unrecognised role", () => {
  assert.throws(() => applyRoleChange(userDoc("x5", GUIDE), "bogus"),
    (err) => err.code === "UNKNOWN_ROLE");
  assert.throws(() => applyRoleChange(userDoc("x6", GUIDE), 7),
    (err) => err.code === "UNKNOWN_ROLE");
});
