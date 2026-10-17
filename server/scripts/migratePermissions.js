// Hybrid permissions migration: "npm run permissions:migrate" (dry run) or
// "npm run permissions:migrate -- --apply".
// Gives every user a single `role`, moves legacy `vehiclePermissions` into
// `permissionGrants`, and checks that nobody gains or loses access.
// The system account only gets role = "ادارة"; nothing else on it is touched.
const path = require("path");
const {
  normalizeRole, resolveRole, expandKeys, effectivePermissions, isSystemTz,
  ROLE_DEFAULTS,
} = require("../utils/permissions");
const { sanitizeVehiclePermissions } = require("../utils/vehicleRules");

const ROOMS = ["active", "waiting", "noActive"];
const ADMIN = "ادارة";

function sameList(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function planUserMigration(user = {}) {
  const warnings = [];
  const rawRoles = Array.isArray(user.roles) ? user.roles : [];
  const role = resolveRole(user);

  if (rawRoles.length === 0 && !role) warnings.push("no role");
  if (rawRoles.some((raw) => !normalizeRole(raw))) warnings.push("unknown role");
  const distinct = new Set(rawRoles.map(normalizeRole).filter(Boolean));
  if (distinct.size > 1) warnings.push("more than one role; kept the highest");

  const grants = [];
  const addGrant = (key) => { if (!grants.includes(key)) grants.push(key); };
  for (const key of Array.isArray(user.permissionGrants) ? user.permissionGrants : []) addGrant(key);
  if (role !== ADMIN) {
    for (const p of sanitizeVehiclePermissions(user.vehiclePermissions)) addGrant(`vehicles.${p}`);
  }

  return {
    role,
    roles: role ? [role] : (Array.isArray(user.roles) ? [...user.roles] : []),
    permissionGrants: grants,
    permissionRevokes: Array.isArray(user.permissionRevokes) ? [...user.permissionRevokes] : [],
    warnings,
  };
}

// What the user could do before the migration: the legacy role defaults plus
// their vehicle permissions (admins already hold every vehicle permission).
function legacyAccess(user) {
  const role = resolveRole(user);
  const set = expandKeys(role ? ROLE_DEFAULTS[role] : []);
  if (role !== ADMIN) {
    for (const p of sanitizeVehiclePermissions(user.vehiclePermissions)) set.add(`vehicles.${p}`);
  }
  return set;
}

async function migrateUsers(model, { apply = false, systemTz } = {}) {
  const rows = [];
  let errors = 0;

  for (const room of ROOMS) {
    const response = await model.get({}, room);
    const users = response?.success && Array.isArray(response.result) ? response.result : [];

    for (const user of users) {
      if (isSystemTz(user.tz, systemTz)) {
        const needs = user.role !== ADMIN;
        rows.push({ tz: user.tz, room, system: true, oldRoles: user.roles || [], role: ADMIN,
          grants: [], before: null, after: null, warnings: [], error: false });
        if (apply && needs) await model.update({ tz: user.tz }, { role: ADMIN }, room);
        continue;
      }

      const plan = planUserMigration(user);
      // A user whose role is already set was migrated before: later grants and
      // revokes are deliberate admin changes, so only align `roles`.
      const alreadyMigrated = Boolean(normalizeRole(user.role));
      if (alreadyMigrated) {
        const afterSet = effectivePermissions(user);
        rows.push({ tz: user.tz, room, system: false, oldRoles: user.roles || [], role: plan.role,
          grants: user.permissionGrants || [], before: afterSet.size, after: afterSet.size,
          warnings: [], error: false });
        const rolesOk = sameList(user.roles || [], [plan.role]) && user.role === plan.role;
        if (apply && !rolesOk) {
          await model.update({ tz: user.tz }, { role: plan.role, roles: [plan.role] }, room);
        }
        continue;
      }

      const before = legacyAccess(user);
      const afterSet = effectivePermissions({ ...user, ...plan });
      const mismatch =
        before.size !== afterSet.size || [...before].some((key) => !afterSet.has(key));
      rows.push({
        tz: user.tz, room, system: false, oldRoles: user.roles || [], role: plan.role,
        grants: plan.permissionGrants, before: before.size, after: afterSet.size,
        warnings: plan.warnings, error: mismatch,
      });
      if (mismatch) { errors += 1; continue; }

      const unchanged =
        user.role === plan.role && sameList(user.roles || [], plan.roles) &&
        sameList(user.permissionGrants || [], plan.permissionGrants) &&
        sameList(user.permissionRevokes || [], plan.permissionRevokes);
      if (apply && !unchanged) {
        await model.update({ tz: user.tz }, {
          role: plan.role,
          roles: plan.roles,
          permissionGrants: plan.permissionGrants,
          permissionRevokes: plan.permissionRevokes,
        }, room);
      }
    }
  }
  return { rows, errors };
}

function formatRow(r) {
  const parts = [
    r.tz, r.room || "-", `old=[${(r.oldRoles || []).join(",")}]`, `new=${r.role ?? "none"}`,
    `grants=[${r.grants.join(",")}]`,
    r.system ? "system" : `perms ${r.before}->${r.after}`,
  ];
  if (r.warnings.length) parts.push(`warn: ${r.warnings.join("; ")}`);
  if (r.error) parts.push("ERROR: effective permissions differ, not written");
  return parts.join(" | ");
}

// Users whose role is missing or not recognised get no role defaults, so
// after the migration they cannot see anything. Listed apart so IT can set
// their role before --apply.
function formatSummary({ rows = [], errors = 0, apply = false } = {}) {
  const noRole = rows.filter((r) => !r.system && !r.role);
  const lines = [];
  if (noRole.length) {
    lines.push("Users with no or unknown role (they will have no access; set a role first):");
    for (const r of noRole) lines.push(`  ${r.tz} | ${r.room || "-"}`);
  }
  lines.push(`${noRole.length} users have no or unknown role and will get no access.`);
  lines.push(`${rows.length} users, ${errors} errors. ${apply ? "Applied." : "Dry run: nothing written (use --apply)."}`);
  return lines;
}

function exitCode({ apply, errors }) {
  return apply && errors > 0 ? 1 : 0;
}

async function main() {
  require("dotenv").config({ path: path.join(__dirname, "..", "config", ".env") });
  const { UserModelDef } = require("../Entities/User/User.model");
  const apply = process.argv.includes("--apply");

  const { rows, errors } = await migrateUsers(UserModelDef, {
    apply, systemTz: process.env.SYSTEM_ADMIN_TZ,
  });
  rows.forEach((r) => console.log(formatRow(r)));
  formatSummary({ rows, errors, apply }).forEach((line) => console.log(line));
  return exitCode({ apply, errors });
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error("Migration failed:", err.message);
      process.exit(1);
    });
}

module.exports = { planUserMigration, legacyAccess, migrateUsers, formatRow, formatSummary, exitCode, ROOMS };
