// Who may change whom. Pure rules, no I/O.
// `actor` is req.actor (or a raw user record); `target` is a user record.
// The system account is detected fail-closed: ctx.isSystemTarget OR the
// target's tz matching SYSTEM_ADMIN_TZ.
const {
  ALL_KEYS,
  DANGEROUS_KEYS,
  ROLE_DEFAULTS,
  ROLE_RANK,
  can,
  effectivePermissions,
  expandKeys,
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

function permissionSet(user) {
  if (!user) return new Set();
  if (user.permissions instanceof Set) return user.permissions;
  return effectivePermissions(user, { isSystem: isSystemActor(user) });
}

function holdsDangerous(user) {
  const set = permissionSet(user);
  for (const key of DANGEROUS_KEYS) if (set.has(key)) return true;
  return false;
}

function isPermissionManager(user) {
  return can(permissionSet(user), "permissions.manage");
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

function canManageTarget(actor, target, ctx = {}) {
  if (!actor || !target || isSystemTarget(target, ctx)) return false;
  if (isSelf(actor, target)) return false;
  if (isSystemActor(actor)) return true;
  if (holdsDangerous(target)) return false;
  return rankOf(actor) > rankOf(target);
}

function grantableBy(actor) {
  if (isSystemActor(actor)) return new Set(ALL_KEYS);
  if (!isPermissionManager(actor)) return new Set();
  const out = new Set(permissionSet(actor));
  for (const key of DANGEROUS_KEYS) out.delete(key);
  return out;
}

function validatePermissionChange(actor, target, changes, ctx = {}) {
  const { grants = [], revokes = [] } = changes || {};
  if (isSelf(actor, target)) return { ok: false, code: "SELF" };
  const systemActor = isSystemActor(actor);
  if (!systemActor && !isPermissionManager(actor)) return { ok: false, code: "FORBIDDEN" };
  if (!canManageTarget(actor, target, ctx)) return { ok: false, code: "FORBIDDEN" };
  if (!systemActor && isPermissionManager(target)) return { ok: false, code: "FORBIDDEN" };

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
  if (!role) return false;
  if (isSelf(actor, target)) return false;
  if (!canManageTarget(actor, target, ctx)) return false;
  if (isSystemActor(actor)) return true;
  // Only a role strictly below one's own.
  if (!(ROLE_RANK[role] < rankOf(actor))) return false;
  const held = permissionSet(actor);
  if (!can(held, "users.changeRole")) return false;
  for (const leaf of expandKeys(ROLE_DEFAULTS[role])) if (!held.has(leaf)) return false;
  return true;
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
  holdsDangerous,
  isPermissionManager,
  canManageTarget,
  grantableBy,
  validatePermissionChange,
  canAssignRole,
  applyRoleChange,
};
