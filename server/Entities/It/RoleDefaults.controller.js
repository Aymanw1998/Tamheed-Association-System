const {
  ROLE_RANK, ROLE_DEFAULTS, ROLE_DEFAULT_KEYS, expandKeys, normalizeRole, resolveRole,
  checkRoleDefaults, setRoleDefaultsOverride, roleDefaults, actorDisplayName,
} = require("../../utils/permissions");
const { logWithSource } = require("../../middleware/logger");

const ROLES = Object.keys(ROLE_RANK).sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a]);
const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";
const rows = (r) => (r?.success && Array.isArray(r.result) ? r.result : []);

// «صلاحيات الأدوار» on the IT site (owner, 2026-11-03): any IT user sets which
// permissions each everyday role has by default. A change reaches every user
// of the role at once; their own grants and revokes stay. Rows live in
// RoleDefaults (one per changed role) and in memory (utils/permissions.js).
// deps (tests): model, users (the active users), audit, now.
function createRoleDefaults(deps = {}) {
  const {
    model = require("./RoleDefaults.model").RoleDefaultsModelDef,
    users = async () => rows(await require("../User/User.model").UserModelDef.get({}, "active")),
    audit = require("../../utils/audit").audit,
    now = () => new Date(),
  } = deps;

  // What the IT site shows for one role.
  const view = (role, row, counts) => ({
    role,
    defaults: [...roleDefaults(role)],
    original: [...expandKeys(ROLE_DEFAULTS[role])],
    custom: Boolean(row),
    updatedAt: row?.updatedAt || null,
    updatedBy: row?.updatedBy || null,
    users: counts[role] || 0,
  });

  const countUsers = async () => {
    const counts = {};
    for (const user of await users()) {
      const role = resolveRole(user);
      if (role) counts[role] = (counts[role] || 0) + 1;
    }
    return counts;
  };

  const rowsByRole = async () => new Map((await model.readAll()).map((row) => [row.role, row]));

  // At start: the stored sets replace the code's.
  const load = async () => {
    for (const row of await model.readAll()) {
      if (ROLES.includes(row.role)) setRoleDefaultsOverride(row.role, Array.isArray(row.keys) ? row.keys : []);
    }
  };

  const roleOf = (req) => {
    const role = normalizeRole(req.params?.role);
    return role && ROLES.includes(role) ? role : null;
  };

  // GET /role-defaults
  const list = async (req, res) => {
    try {
      const [stored, counts] = await Promise.all([rowsByRole(), countUsers()]);
      return res.status(200).json({
        ok: true,
        roles: ROLES.map((role) => view(role, stored.get(role), counts)),
        grantable: ROLE_DEFAULT_KEYS,
      });
    } catch (err) {
      logWithSource("RoleDefaults.list", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  const record = (req, action, role, before, after) => audit.record(req, {
    module: "permissions", action, targetType: "role", targetId: role, targetLabel: role,
    before: { defaults: [...before].sort() }, after: { defaults: [...after].sort() },
  });

  // PUT /role-defaults/:role { keys }
  const save = async (req, res) => {
    try {
      const role = roleOf(req);
      if (!role) return res.status(400).json({ ok: false, code: "UNKNOWN_ROLE" });
      const checked = checkRoleDefaults(req.body?.keys);
      if (!checked.ok) return res.status(400).json({ ok: false, code: checked.code });
      const before = roleDefaults(role);
      const row = { keys: checked.keys.sort(), updatedAt: now(), updatedBy: actorDisplayName(req.actor) };
      await model.write(role, row);
      setRoleDefaultsOverride(role, row.keys);
      await record(req, "role_defaults_change", role, before, roleDefaults(role));
      return res.status(200).json({ ok: true, role: view(role, row, await countUsers()) });
    } catch (err) {
      logWithSource("RoleDefaults.save", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  // DELETE /role-defaults/:role: back to the code's set.
  const reset = async (req, res) => {
    try {
      const role = roleOf(req);
      if (!role) return res.status(400).json({ ok: false, code: "UNKNOWN_ROLE" });
      const before = roleDefaults(role);
      await model.remove(role);
      setRoleDefaultsOverride(role, null);
      await record(req, "role_defaults_reset", role, before, roleDefaults(role));
      return res.status(200).json({ ok: true, role: view(role, null, await countUsers()) });
    } catch (err) {
      logWithSource("RoleDefaults.reset", err);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  };

  return { load, list, save, reset };
}

// The one the server uses, made on first use (so requiring this file does
// not pull in the database layer).
let shared = null;
const sharedRoleDefaults = () => shared || (shared = createRoleDefaults());

module.exports = { createRoleDefaults, roleDefaults: sharedRoleDefaults };
