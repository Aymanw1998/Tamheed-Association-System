const { repairMisencodedText } = require("./textEncoding");

/* ================= Permission tree ================= */
const PERMISSION_TREE = {
  dashboard: ["view"], calendar: ["view"],
  students: ["view", "viewAll", "create", "edit", "delete", "photo", "parentLink"],
  lessons: ["view", "viewAll", "create", "edit", "roster", "delete", "copyMonth"],
  attendance: ["view", "record"],
  reports: ["create", "editOwn", "viewAll", "editAll", "delete", "exportPdf"],
  vehicles: ["view", "edit", "compliance", "documents", "archive", "delete"], // delete: admin default only
  files: ["use", "manageAll"],
  notices: ["view", "post", "runCheck"],
  users: ["view", "create", "edit", "approve", "delete", "changeRole", "passwords", "unlock"],
  ai: ["use"], permissions: ["manage"], audit: ["view"], systemRecovery: ["reset"],
  sports: ["view"], finance: ["view"], // reserved
};

const ROLE_DEFAULTS = {
  "ادارة": ["dashboard", "calendar", "students", "lessons", "attendance", "reports", "vehicles",
            "files", "notices", "users.view", "users.create", "users.edit", "users.approve",
            "users.delete", "ai"],
  "مرشد": ["dashboard", "calendar", "students.view", "students.edit", "students.photo",
           "lessons.view", "lessons.create", "lessons.edit", "lessons.roster",
           "attendance", "reports.create", "reports.editOwn", "reports.exportPdf",
           "files.use", "ai"],
  "مساعد": ["dashboard", "calendar", "students.view", "lessons.view", "attendance.view",
            "reports.create", "reports.editOwn", "reports.exportPdf", "files.use", "ai"],
};

const ROLE_RANK = { "ادارة": 3, "مرشد": 2, "مساعد": 1 };

const DANGEROUS_KEYS = new Set([
  "users.changeRole", "users.passwords", "users.unlock",
  "permissions.manage", "audit.view", "systemRecovery.reset",
]);

const GRANT_ONLY_MODULES = new Set(["sports", "finance"]);

const ALL_KEYS = Object.entries(PERMISSION_TREE).flatMap(([module, leaves]) =>
  leaves.map((leaf) => `${module}.${leaf}`));

const ROLE_ALIASES = {
  "ادارة": "ادارة",
  "إدارة": "ادارة",
  "الادارة": "ادارة",
  "الإدارة": "ادارة",
  "مرشد": "مرشد",
  "مرشدة": "مرشد",
  "المرشد": "مرشد",
  "المرشدة": "مرشد",
  "مساعد": "مساعد",
  "مساعدة": "مساعد",
  "المساعد": "مساعد",
  "المساعدة": "مساعد",
};

/* ================= Helpers ================= */
function normalizeRole(raw) {
  if (typeof raw !== "string") return null;
  const cleaned = String(repairMisencodedText(raw)).trim();
  return Object.hasOwn(ROLE_ALIASES, cleaned) ? ROLE_ALIASES[cleaned] : null;
}

// A module key expands to all of its leaves; unknown keys are dropped.
function expandKeys(keys) {
  const out = new Set();
  for (const raw of Array.isArray(keys) ? keys : []) {
    const key = String(raw || "").trim();
    if (Object.hasOwn(PERMISSION_TREE, key)) {
      for (const leaf of PERMISSION_TREE[key]) out.add(`${key}.${leaf}`);
    } else if (ALL_KEYS.includes(key)) {
      out.add(key);
    }
  }
  return out;
}

function resolveRole(user) {
  const direct = normalizeRole(user?.role);
  if (direct) return direct;
  let best = null;
  for (const raw of Array.isArray(user?.roles) ? user.roles : []) {
    const role = normalizeRole(raw);
    if (role && (!best || ROLE_RANK[role] > ROLE_RANK[best])) best = role;
  }
  return best;
}

// effective = (roleDefaults U grants) - revokes
function effectivePermissions(user, { isSystem = false } = {}) {
  if (isSystem) return new Set(ALL_KEYS);
  const role = resolveRole(user);
  const allowed = expandKeys(role ? ROLE_DEFAULTS[role] : []);
  for (const key of expandKeys(user?.permissionGrants)) allowed.add(key);
  for (const key of expandKeys(user?.permissionRevokes)) allowed.delete(key);
  return allowed;
}

// actorOrSet is a Set of keys or an actor (user) object. A module key means
// every one of its leaves.
function can(actorOrSet, key) {
  if (!actorOrSet) return false;
  // req.actor already carries its computed Set; its role/grant fields are
  // named differently from a user record, so recomputing would be wrong.
  const set = actorOrSet instanceof Set ? actorOrSet
    : actorOrSet.permissions instanceof Set ? actorOrSet.permissions
    : effectivePermissions(actorOrSet, { isSystem: actorOrSet.isSystem === true });
  const needed = expandKeys([key]);
  if (needed.size === 0) return false;
  for (const leaf of needed) if (!set.has(leaf)) return false;
  return true;
}

// Blank values never match. Only the configured value is trimmed: a stored
// tz with surrounding whitespace is a different account, never the system.
function isSystemTz(tz, systemTz = process.env.SYSTEM_ADMIN_TZ) {
  const expected = String(systemTz || "").trim();
  const actual = tz == null ? "" : String(tz);
  return Boolean(expected) && actual === expected;
}

module.exports = {
  PERMISSION_TREE,
  ROLE_RANK,
  ROLE_DEFAULTS,
  DANGEROUS_KEYS,
  GRANT_ONLY_MODULES,
  ALL_KEYS,
  normalizeRole,
  resolveRole,
  expandKeys,
  effectivePermissions,
  can,
  isSystemTz,
};
