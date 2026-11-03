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
  // passwords: view a user's password (IT); resetPassword: set a new one.
  users: ["view", "create", "edit", "approve", "delete", "changeRole", "passwords", "unlock", "resetPassword"],
  ai: ["use"], permissions: ["manage"], audit: ["view"], systemRecovery: ["reset"],
  sports: ["view", "coach", "manage"], finance: ["view"], // finance reserved
  storage: ["drive"], // the Drive account the app stores in: an IT action
};

const ROLE_DEFAULTS = {
  "ادارة": ["dashboard", "calendar", "students", "lessons", "attendance", "reports", "vehicles",
            "files", "notices", "users.view", "users.create", "users.edit", "users.approve",
            "users.delete", "users.changeRole", "users.resetPassword", "ai"],
  // Only an admin edits students, lessons and users (owner, 2026-11-01); an
  // admin may still grant one guide an edit key in the permissions screen.
  "مرشد": ["dashboard", "calendar", "students.view",
           "lessons.view",
           "attendance", "reports.create", "reports.editOwn", "reports.exportPdf",
           "files.use", "ai"],
  "مساعد": ["dashboard", "calendar", "students.view", "lessons.view", "attendance.view",
            "reports.create", "reports.editOwn", "reports.exportPdf", "files.use", "ai"],
};

const ROLE_RANK = { "ادارة": 3, "مرشد": 2, "مساعد": 1 };

// What only the IT site does (IT-site design, 2026-11-03). No everyday set
// ever holds one, not even the system account's.
const IT_KEYS = new Set([
  "permissions.manage", "users.passwords", "users.unlock",
  "audit.view", "storage.drive", "systemRecovery.reset",
]);

// What an IT user may do on the IT site.
const IT_SET = [...IT_KEYS, "users.view", "users.changeRole", "users.resetPassword", "users.approve"];

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

// The everyday set: effective = (roleDefaults U grants) - revokes - IT_KEYS.
// The system account holds every other key; a stored IT-key grant is ignored.
function effectivePermissions(user, { isSystem = false } = {}) {
  let allowed;
  if (isSystem) {
    allowed = new Set(ALL_KEYS);
  } else {
    const role = resolveRole(user);
    allowed = expandKeys(role ? ROLE_DEFAULTS[role] : []);
    for (const key of expandKeys(user?.permissionGrants)) allowed.add(key);
    for (const key of expandKeys(user?.permissionRevokes)) allowed.delete(key);
  }
  for (const key of IT_KEYS) allowed.delete(key);
  return allowed;
}

const isItUser = (user) => user?.isIT === true;
// An IT user the system account has not blocked.
const isUnblockedItUser = (user) => isItUser(user) && !user.itBlockedAt;

// The IT set: empty unless the user is IT and not blocked. The system
// account always has it and is never blocked.
function itPermissions(user, { isSystem = false } = {}) {
  if (isSystem) return new Set(IT_SET);
  if (!isUnblockedItUser(user)) return new Set();
  return new Set(IT_SET);
}

// The user model's email default, which reaches nobody.
const PLACEHOLDER_EMAIL = "test@test.com";

// A mailbox an IT code can be sent to: not empty, has "@", not the placeholder.
function hasRealEmail(user) {
  const email = String(user?.email ?? "").trim();
  return email.includes("@") && email.toLowerCase() !== PLACEHOLDER_EMAIL;
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

// How a stored record names who acted: the system account is always
// "system" / "النظام", never its tz, id or personal name.
const SYSTEM_ACTOR = "system";
const SYSTEM_ACTOR_NAME = "النظام";
const actorRef = (actor, ref) => (actor?.isSystem ? SYSTEM_ACTOR : ref);
const actorDisplayName = (actor) =>
  (actor?.isSystem ? SYSTEM_ACTOR_NAME : actor?.name || String(actor?.tz || ""));

module.exports = {
  SYSTEM_ACTOR,
  SYSTEM_ACTOR_NAME,
  actorRef,
  actorDisplayName,
  PERMISSION_TREE,
  ROLE_RANK,
  ROLE_DEFAULTS,
  IT_KEYS,
  GRANT_ONLY_MODULES,
  ALL_KEYS,
  normalizeRole,
  resolveRole,
  expandKeys,
  effectivePermissions,
  isItUser,
  isUnblockedItUser,
  itPermissions,
  hasRealEmail,
  can,
  isSystemTz,
};
