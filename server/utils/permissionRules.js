// Who may change whom. Pure rules, no I/O.
// `actor` is req.actor (or a raw user record); `target` is a user record.
// The system account is detected fail-closed: ctx.isSystemTarget OR the
// target's tz matching SYSTEM_ADMIN_TZ. `actor.it` is true only for the IT
// site's actor; a missing flag is false (the everyday app).
const {
  ALL_KEYS,
  IT_KEYS,
  roleDefaults,
  ROLE_RANK,
  can,
  effectivePermissions,
  expandKeys,
  isItUser,
  isSystemTz,
  normalizeRole,
  resolveRole,
} = require("./permissions");

// req.actor carries an explicit boolean isSystem; a raw user record is
// detected by its tz.
function isSystemActor(actor) {
  if (!actor) return false;
  if (typeof actor.isSystem === "boolean") return actor.isSystem;
  return isSystemTz(actor.tz);
}

function isSystemTarget(target, ctx) {
  return ctx?.isSystemTarget === true || isSystemTz(target?.tz);
}

const isItActor = (actor) => actor?.it === true;

function permissionSet(user) {
  if (!user) return new Set();
  if (user.permissions instanceof Set) return user.permissions;
  return effectivePermissions(user, { isSystem: isSystemActor(user) });
}

function rankOf(user) {
  return ROLE_RANK[resolveRole(user)] || 0;
}

function isSelf(actor, target) {
  const actorId = String(actor?.id ?? actor?._id ?? "").trim();
  const targetId = String(target?._id ?? target?.id ?? "").trim();
  if (actorId && targetId && actorId === targetId) return true;
  const actorTz = String(actor?.tz ?? "").trim();
  const targetTz = String(target?.tz ?? "").trim();
  return Boolean(actorTz) && actorTz === targetTz;
}

// An IT user's account is touched only by the system account on the IT
// site; an IT actor manages any everyday user; in the everyday app the system
// account manages anyone else and everyone else needs a higher rank.
function canManageTarget(actor, target, ctx = {}) {
  if (!actor || !target || isSystemTarget(target, ctx)) return false;
  if (isSelf(actor, target)) return false;
  if (isItUser(target)) return isSystemActor(actor) && isItActor(actor);
  if (isItActor(actor)) return true;
  if (isSystemActor(actor)) return true;
  return rankOf(actor) > rankOf(target);
}

// Personal details only (owner, 2026-11-03): besides whoever canManageTarget,
// an everyday actor edits the details of an IT user ranked below him (a
// guide who is also IT). Never his password, email, role, room or account
// state: those stay with canManageTarget (User.controller.js DETAIL_FIELDS).
function canEditDetails(actor, target, ctx = {}) {
  if (canManageTarget(actor, target, ctx)) return true;
  if (!actor || !target || isSystemTarget(target, ctx) || isSelf(actor, target)) return false;
  if (!isItUser(target) || isItActor(actor)) return false;
  return isSystemActor(actor) || rankOf(actor) > rankOf(target);
}

// Only the IT actor changes permissions, and never grants an IT key.
function grantableBy(actor) {
  if (!isItActor(actor)) return new Set();
  return new Set(ALL_KEYS.filter((key) => !IT_KEYS.has(key)));
}

function validatePermissionChange(actor, target, changes, ctx = {}) {
  const { grants = [], revokes = [] } = changes || {};
  // An IT user changes his own everyday permissions on the IT site (owner,
  // 2026-11-03), never an IT key (below). Nobody else changes his own, and
  // the system account's are not stored.
  const self = isSelf(actor, target);
  if (self && (!isItActor(actor) || isSystemTarget(target, ctx))) return { ok: false, code: "SELF" };
  if (!isItActor(actor)) return { ok: false, code: "FORBIDDEN" };
  if (!self && !canManageTarget(actor, target, ctx)) return { ok: false, code: "FORBIDDEN" };

  if ((grants != null && !Array.isArray(grants)) || (revokes != null && !Array.isArray(revokes))) {
    return { ok: false, code: "UNKNOWN_KEY" };
  }
  const keys = [...(grants || []), ...(revokes || [])];
  for (const key of keys) {
    if (typeof key !== "string" || expandKeys([key]).size === 0) return { ok: false, code: "UNKNOWN_KEY" };
  }
  const allowed = grantableBy(actor);
  for (const key of keys) {
    for (const leaf of expandKeys([key])) {
      if (!allowed.has(leaf)) return { ok: false, code: "NOT_GRANTABLE" };
    }
  }
  return { ok: true };
}

function canAssignRole(actor, target, newRole, ctx = {}) {
  const role = normalizeRole(newRole);
  if (!role || !actor || !target || isSystemTarget(target, ctx)) return false;
  // The one self exception: an IT user gives himself an everyday role.
  if (isSelf(actor, target)) return isItActor(actor);
  if (!canManageTarget(actor, target, ctx)) return false;
  if (isItActor(actor) || isSystemActor(actor)) return true;
  // Only a role strictly below one's own.
  if (!(ROLE_RANK[role] < rankOf(actor))) return false;
  const held = permissionSet(actor);
  if (!can(held, "users.changeRole")) return false;
  for (const leaf of roleDefaults(role)) if (!held.has(leaf)) return false;
  return true;
}

// Setting a new password: the IT actor for whoever he manages; in the
// everyday app users.resetPassword and a target he manages (lower rank, not
// IT, not himself).
function canResetPassword(actor, target, ctx = {}) {
  if (!canManageTarget(actor, target, ctx)) return false;
  return isItActor(actor) || can(permissionSet(actor), "users.resetPassword");
}

// Promotion or same rank keeps special permissions; demotion (including to
// no role: null/undefined/"") clears them. Any other unrecognised role throws
// an Error with code "UNKNOWN_ROLE" rather than silently dropping the role.
function applyRoleChange(target, newRole) {
  const isBlank = newRole == null || (typeof newRole === "string" && newRole.trim() === "");
  const role = isBlank ? null : normalizeRole(newRole);
  if (!isBlank && !role) {
    const err = new Error("Unknown role");
    err.code = "UNKNOWN_ROLE";
    throw err;
  }
  const oldRole = resolveRole(target);
  const demoted = Boolean(oldRole) && (!role || ROLE_RANK[role] < ROLE_RANK[oldRole]);
  const grants = Array.isArray(target?.permissionGrants) ? [...target.permissionGrants] : [];
  const revokes = Array.isArray(target?.permissionRevokes) ? [...target.permissionRevokes] : [];
  return {
    role,
    roles: role ? [role] : [],
    permissionGrants: demoted ? [] : grants,
    permissionRevokes: demoted ? [] : revokes,
    demoted,
  };
}

module.exports = {
  isItActor,
  canManageTarget,
  canEditDetails,
  grantableBy,
  validatePermissionChange,
  canAssignRole,
  canResetPassword,
  applyRoleChange,
};
