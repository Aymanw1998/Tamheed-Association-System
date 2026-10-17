const { effectivePermissions, can, isSystemTz, resolveRole } = require("../utils/permissions");
const { logWithSource } = require("./logger");
const { LOCKED_MESSAGE, isLocked } = require("../utils/loginLockout");

const FORBIDDEN_BODY = { code: "FORBIDDEN", message: "لا توجد صلاحية" };

// Loaded lazily so requiring this file does not pull in the database layer.
async function defaultFindActiveUserByTz(tz) {
  const { UserModelDef } = require("../Entities/User/User.model");
  const result = await UserModelDef.get({ tz }, "active");
  if (result?.success && Array.isArray(result.result) && result.result.length > 0) {
    return result.result[0];
  }
  return null;
}

// Runs after requireAuth. The JWT outlives permission changes, so the user is
// re-read from the active room on every request.
function createLoadActor({ findActiveUserByTz, systemTz } = {}) {
  return async function loadActor(req, res, next) {
    try {
      const tz = req.user?.tz;
      const user = tz ? await findActiveUserByTz(tz) : null;
      if (!user) return res.status(401).json({ code: "NO_ACTIVE" });

      const actorTz = String(user.tz || "");
      const isSystem = isSystemTz(actorTz, systemTz === undefined ? process.env.SYSTEM_ADMIN_TZ : systemTz);
      if (isLocked(user, { isSystem })) {
        return res.status(423).json({ code: "ACCOUNT_LOCKED", message: LOCKED_MESSAGE });
      }

      const name = `${user.firstname || ""} ${user.lastname || ""}`.trim();
      req.actor = {
        id: String(user._id ?? ""),
        tz: actorTz,
        name,
        role: resolveRole(user),
        grants: Array.isArray(user.permissionGrants) ? user.permissionGrants : [],
        revokes: Array.isArray(user.permissionRevokes) ? user.permissionRevokes : [],
        permissions: effectivePermissions(user, { isSystem }),
        isSystem,
        user,
      };
      return next();
    } catch (error) {
      logWithSource("permissionMiddleware.loadActor", error);
      return next(error);
    }
  };
}

const loadActor = createLoadActor({ findActiveUserByTz: defaultFindActiveUserByTz });

function requirePermission(...keys) {
  return (req, res, next) => {
    const set = req.actor?.permissions;
    if (set && keys.some((key) => can(set, key))) return next();
    return res.status(403).json(FORBIDDEN_BODY);
  };
}

// True when `identity` (a route param) names the actor: their tz, or their DB
// id unless tzOnly. A blank identity never matches.
function isSelf(actor, identity, { tzOnly = false } = {}) {
  const target = String(identity ?? "").trim();
  if (!target || !actor) return false;
  if (target === String(actor.tz ?? "").trim()) return true;
  return !tzOnly && target === String(actor.user?._id ?? "").trim();
}

// The actor may act on their own record (req.params[paramName]); anyone else
// needs one of the keys.
function requireSelfOr(paramName, ...keys) {
  const permitted = requirePermission(...keys);
  return (req, res, next) =>
    isSelf(req.actor, req.params?.[paramName]) ? next() : permitted(req, res, next);
}

function actorLabel(actor) {
  if (actor?.isSystem) return { actor: "system", actorName: "النظام" };
  const tz = String(actor?.tz || "");
  return { actor: tz, actorName: actor?.name || tz };
}

module.exports = { createLoadActor, loadActor, requirePermission, requireSelfOr, isSelf, actorLabel };
