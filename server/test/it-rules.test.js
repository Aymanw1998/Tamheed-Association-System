// The IT layer (IT-site design, "Who may do what", 2026-11-03).
const assert = require("node:assert/strict");
const test = require("node:test");
// These tests hold the rules with IT's switch off; admin-powers.test.js holds it on.
require("../utils/permissionRules").setAdminPowers(false);

const {
  ALL_KEYS,
  IT_KEYS,
  effectivePermissions,
  itPermissions,
  isItUser,
} = require("../utils/permissions");
const {
  canManageTarget,
  canAssignRole,
  validatePermissionChange,
  canResetPassword,
  canEditDetails,
} = require("../utils/permissionRules");

const ADMIN = "ادارة";
const GUIDE = "مرشد";
const ASSISTANT = "مساعد";
const CTX = { isSystemTarget: false };

function userDoc(id, role, extra = {}) {
  return { _id: id, tz: `tz-${id}`, role, roles: role ? [role] : [], permissionGrants: [], permissionRevokes: [], ...extra };
}

// The shape loadActor puts on req.actor; `it` is true only for the IT actor.
function actorOf(doc, { isSystem = false, it = false } = {}) {
  return {
    id: String(doc._id),
    tz: doc.tz,
    name: "test",
    role: doc.role,
    grants: doc.permissionGrants,
    revokes: doc.permissionRevokes,
    permissions: it ? itPermissions(doc, { isSystem }) : effectivePermissions(doc, { isSystem }),
    isSystem,
    it,
    user: doc,
  };
}

const systemDoc = userDoc("sys", ADMIN);
const itDoc = userDoc("it1", GUIDE, { isIT: true });
const otherItDoc = userDoc("it2", ASSISTANT, { isIT: true });
const adminDoc = userDoc("a1", ADMIN);
const otherAdmin = userDoc("a2", ADMIN);
const guide = userDoc("g1", GUIDE);
const assistant = userDoc("s1", ASSISTANT);

const admin = actorOf(adminDoc);
const itActor = actorOf(itDoc, { it: true });
const systemIt = actorOf(systemDoc, { isSystem: true, it: true });
const systemEveryday = actorOf(systemDoc, { isSystem: true });

test("IT_KEYS has the six keys that move to the IT site", () => {
  assert.deepEqual([...IT_KEYS].sort(), ["audit.view", "permissions.manage", "storage.drive",
    "systemRecovery.reset", "users.passwords", "users.unlock"]);
  assert.equal(isItUser(itDoc), true);
  assert.equal(isItUser(guide), false);
  assert.equal(isItUser({ isIT: "true" }), false);
  assert.equal(isItUser(null), false);
});

test("everyday actor never carries IT keys, even for an IT user", () => {
  for (const doc of [adminDoc, guide, assistant, itDoc, userDoc("it3", ADMIN, { isIT: true })]) {
    const set = effectivePermissions(doc);
    for (const key of IT_KEYS) assert.ok(!set.has(key), `${doc._id} ${key}`);
  }
  const system = effectivePermissions(systemDoc, { isSystem: true });
  for (const key of IT_KEYS) assert.ok(!system.has(key), key);
  assert.equal(system.size, ALL_KEYS.length - IT_KEYS.size);
  assert.ok(system.has("users.resetPassword") && system.has("sports.manage"));
});

test("stored IT-key grants are ignored", () => {
  const set = effectivePermissions(userDoc("g2", GUIDE, {
    permissionGrants: ["permissions", "audit", "users.passwords", "users.unlock", "storage.drive", "systemRecovery", "sports"],
  }));
  for (const key of IT_KEYS) assert.ok(!set.has(key), key);
  assert.ok(set.has("sports.view"));
});

test("an IT user gets the IT set only from itPermissions, and nothing when blocked", () => {
  const expected = [...IT_KEYS, "users.view", "users.changeRole", "users.resetPassword", "users.approve", "users.delete", "users.create"].sort();
  assert.deepEqual([...itPermissions(itDoc)].sort(), expected);
  assert.deepEqual([...itPermissions({ ...itDoc, itBlockedAt: new Date() })], []);
  assert.deepEqual([...itPermissions(guide)], []);
  assert.deepEqual([...itPermissions(adminDoc)], []);
  // The system account is never blocked and needs no isIT flag.
  assert.deepEqual([...itPermissions(systemDoc, { isSystem: true })].sort(), expected);
  assert.deepEqual([...itPermissions({ ...systemDoc, itBlockedAt: new Date() }, { isSystem: true })].sort(), expected);
});

test("an IT user cannot manage another IT user; the system IT actor can", () => {
  assert.equal(canManageTarget(itActor, otherItDoc, CTX), false);
  assert.equal(canManageTarget(itActor, itDoc, CTX), false);
  assert.equal(canManageTarget(systemIt, otherItDoc, CTX), true);
  // The system account in the everyday app does not touch IT users.
  assert.equal(canManageTarget(systemEveryday, otherItDoc, CTX), false);
  // Nor does an administrator, whatever the IT user's everyday rank.
  assert.equal(canManageTarget(admin, otherItDoc, CTX), false);
  // An IT actor manages any everyday user, administrators included.
  assert.equal(canManageTarget(itActor, otherAdmin, CTX), true);
  assert.equal(canManageTarget(itActor, guide, CTX), true);
  // Nobody manages the system account.
  assert.equal(canManageTarget(itActor, systemDoc, { isSystemTarget: true }), false);
  assert.equal(canManageTarget(systemIt, { ...systemDoc, _id: "sys2", tz: "tz-sys2" }, { isSystemTarget: true }), false);
});

test("an administrator changes roles of lower rank by default", () => {
  assert.ok(effectivePermissions(adminDoc).has("users.changeRole"));
  assert.ok(effectivePermissions(adminDoc).has("users.resetPassword"));
  assert.equal(canAssignRole(admin, guide, ASSISTANT, CTX), true);
  assert.equal(canAssignRole(admin, assistant, GUIDE, CTX), true);
  assert.equal(canAssignRole(admin, guide, ADMIN, CTX), false);
  assert.equal(canAssignRole(admin, otherAdmin, GUIDE, CTX), false);
  assert.equal(canAssignRole(admin, adminDoc, GUIDE, CTX), false);
  assert.equal(canAssignRole(admin, otherItDoc, ASSISTANT, CTX), false);
});

test("only an IT actor changes permissions, and never grants an IT key", () => {
  const managerDoc = userDoc("m1", ADMIN, { permissionGrants: ["permissions.manage"] });
  assert.deepEqual(validatePermissionChange(actorOf(managerDoc), guide, { grants: ["students.create"] }, CTX),
    { ok: false, code: "FORBIDDEN" });
  assert.deepEqual(validatePermissionChange(admin, guide, { grants: ["students.create"] }, CTX),
    { ok: false, code: "FORBIDDEN" });
  assert.deepEqual(validatePermissionChange(systemEveryday, guide, { grants: ["students.create"] }, CTX),
    { ok: false, code: "FORBIDDEN" });
  assert.deepEqual(validatePermissionChange(itActor, guide, { grants: ["students.create", "sports"] }, CTX), { ok: true });
  assert.deepEqual(validatePermissionChange(itActor, otherAdmin, { revokes: ["files.manageAll"] }, CTX), { ok: true });
  for (const key of [...IT_KEYS, "permissions", "audit"]) {
    assert.deepEqual(validatePermissionChange(itActor, guide, { grants: [key] }, CTX),
      { ok: false, code: "NOT_GRANTABLE" }, key);
    assert.deepEqual(validatePermissionChange(systemIt, guide, { grants: [key] }, CTX),
      { ok: false, code: "NOT_GRANTABLE" }, key);
  }
  assert.deepEqual(validatePermissionChange(itActor, otherItDoc, { grants: ["ai"] }, CTX), { ok: false, code: "FORBIDDEN" });
  assert.deepEqual(validatePermissionChange(systemIt, otherItDoc, { grants: ["ai"] }, CTX), { ok: true });
  // His own everyday permissions: always, on the IT site (owner, 2026-11-03); never an IT key.
  assert.deepEqual(validatePermissionChange(itActor, itDoc, { grants: ["ai"] }, CTX), { ok: true });
  assert.deepEqual(validatePermissionChange(itActor, itDoc, { revokes: ["students.view"] }, CTX), { ok: true });
  assert.deepEqual(validatePermissionChange(itActor, itDoc, { grants: ["audit.view"] }, CTX), { ok: false, code: "NOT_GRANTABLE" });
  // The same user in the everyday app: still not himself.
  assert.deepEqual(validatePermissionChange(actorOf(itDoc), itDoc, { grants: ["ai"] }, CTX), { ok: false, code: "SELF" });
});

test("an IT user may give himself an everyday role", () => {
  for (const role of [ADMIN, GUIDE, ASSISTANT]) assert.equal(canAssignRole(itActor, itDoc, role, CTX), true, role);
  assert.equal(canAssignRole(itActor, itDoc, "bogus", CTX), false);
  // Only the IT actor: the same user in the everyday app may not.
  assert.equal(canAssignRole(actorOf(itDoc), itDoc, ADMIN, CTX), false);
  // An IT actor gives any role to an everyday user, never to another IT user.
  assert.equal(canAssignRole(itActor, otherAdmin, ASSISTANT, CTX), true);
  assert.equal(canAssignRole(itActor, guide, ADMIN, CTX), true);
  assert.equal(canAssignRole(itActor, otherItDoc, ADMIN, CTX), false);
  assert.equal(canAssignRole(systemIt, otherItDoc, ADMIN, CTX), true);
  assert.equal(canAssignRole(itActor, systemDoc, GUIDE, { isSystemTarget: true }), false);
});

test("canResetPassword: admin below his rank, never an IT user", () => {
  assert.equal(canResetPassword(admin, guide, CTX), true);
  assert.equal(canResetPassword(admin, assistant, CTX), true);
  assert.equal(canResetPassword(admin, otherAdmin, CTX), false);
  assert.equal(canResetPassword(admin, adminDoc, CTX), false);
  assert.equal(canResetPassword(admin, otherItDoc, CTX), false);
  assert.equal(canResetPassword(admin, systemDoc, { isSystemTarget: true }), false);
  // A guide has no users.resetPassword by default.
  assert.equal(canResetPassword(actorOf(guide), assistant, CTX), false);
  const revoked = actorOf(userDoc("a3", ADMIN, { permissionRevokes: ["users.resetPassword"] }));
  assert.equal(canResetPassword(revoked, guide, CTX), false);
  // The IT actor: whoever he may manage.
  assert.equal(canResetPassword(itActor, otherAdmin, CTX), true);
  assert.equal(canResetPassword(itActor, otherItDoc, CTX), false);
  assert.equal(canResetPassword(itActor, itDoc, CTX), false);
  assert.equal(canResetPassword(systemIt, otherItDoc, CTX), true);
});

test("a missing it flag is false", () => {
  const { it, ...plain } = itActor;
  assert.equal(it, true);
  assert.equal(canManageTarget({ ...plain, permissions: effectivePermissions(itDoc) }, otherAdmin, CTX), false);
  assert.deepEqual(validatePermissionChange(plain, guide, { grants: ["ai"] }, CTX), { ok: false, code: "FORBIDDEN" });
});

test("canEditDetails: an administrator edits the details of an IT user below him, not one of equal rank, not his account", () => {
  // A guide who is also IT: details yes, the account no.
  assert.equal(canEditDetails(admin, itDoc, CTX), true);
  assert.equal(canManageTarget(admin, itDoc, CTX), false);
  // An IT administrator: equal rank, nothing.
  assert.equal(canEditDetails(admin, userDoc("it3", ADMIN, { isIT: true }), CTX), false);
  // A guide does not edit an IT assistant (no users.edit is checked here, only rank).
  assert.equal(canEditDetails(actorOf(guide), otherItDoc, CTX), true);
  assert.equal(canEditDetails(actorOf(assistant), otherItDoc, CTX), false);
  // Never oneself, never the system account; an ordinary user follows canManageTarget.
  assert.equal(canEditDetails(actorOf(itDoc), itDoc, CTX), false);
  assert.equal(canEditDetails(admin, itDoc, { isSystemTarget: true }), false);
  assert.equal(canEditDetails(admin, guide, CTX), true);
  assert.equal(canEditDetails(admin, otherAdmin, CTX), false);
  // The IT actor still never reaches another IT user.
  assert.equal(canEditDetails(itActor, otherItDoc, CTX), false);
});
