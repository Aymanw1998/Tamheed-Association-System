// Test helpers: build req.actor the way permissionMiddleware.loadActor does,
// from a user record, without a database.
const pm = require("../../middleware/permissionMiddleware");
const { effectivePermissions, resolveRole } = require("../../utils/permissions");

// `user` is a DB-shaped record ({ _id?, id?, tz, roles?, role?, permissionGrants?, ... }).
function actorFor(user = {}, { isSystem = false } = {}) {
  const name = `${user.firstname || ""} ${user.lastname || ""}`.trim();
  return {
    id: String(user._id ?? user.id ?? ""),
    tz: String(user.tz || ""),
    name,
    role: resolveRole(user),
    grants: user.permissionGrants || [],
    revokes: user.permissionRevokes || [],
    permissions: effectivePermissions(user, { isSystem }),
    isSystem,
    user: { ...user, _id: user._id ?? user.id },
  };
}

// The real loadActor, reading the "DB user" from the signed-in req.user
// (tz, roles from the token). Use where a test loads a real router.
const tokenLoadActor = (req, res, next) =>
  pm.createLoadActor({
    systemTz: "",
    findActiveUserByTz: async () => (req.user ? { ...req.user, _id: req.user.id } : null),
  })(req, res, next);

// permissionMiddleware with loadActor replaced by tokenLoadActor.
const permissionMiddlewareStub = () => ({ ...pm, loadActor: tokenLoadActor });

module.exports = { actorFor, tokenLoadActor, permissionMiddlewareStub };
