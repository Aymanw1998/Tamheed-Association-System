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

// What an IT user may do on the IT site. users.approve also disables and
// re-enables an account; users.delete deletes one; users.create makes a new
// IT user (owner, 2026-11-03).
const IT_SET = [...IT_KEYS, "users.view", "users.changeRole", "users.resetPassword", "users.approve", "users.delete", "users.create"];

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

/* ================= Role defaults set on the IT site ================= */
// IT may replace a role's defaults («صلاحيات الأدوار», owner 2026-11-03). The
// stored sets live here (Entities/It/RoleDefaults.controller.js loads them at
// start and after each change); a role without one uses ROLE_DEFAULTS.
// No IT key and no grant-only module may ever be a default.
const ROLE_DEFAULT_KEYS = ALL_KEYS.filter((key) => !IT_KEYS.has(key) && !GRANT_ONLY_MODULES.has(key.split(".")[0]));
const roleOverrides = new Map();

// keys: module or leaf keys → { ok, keys: leaves } or { ok: false, code }.
function checkRoleDefaults(keys) {
  if (!Array.isArray(keys)) return { ok: false, code: "UNKNOWN_KEY" };
  for (const raw of keys) {
    const key = typeof raw === "string" ? raw.trim() : "";
    const module = key.split(".")[0];
    if (!Object.hasOwn(PERMISSION_TREE, key) && !ALL_KEYS.includes(key)) return { ok: false, code: "UNKNOWN_KEY" };
    if (GRANT_ONLY_MODULES.has(module)) return { ok: false, code: "GRANT_ONLY" };
    for (const leaf of expandKeys([key])) if (IT_KEYS.has(leaf)) return { ok: false, code: "IT_KEY" };
  }
  return { ok: true, keys: [...expandKeys(keys)] };
}

// null drops the stored set (back to ROLE_DEFAULTS); keys that may not be
// defaults are left out.
function setRoleDefaultsOverride(role, keys) {
  if (keys == null) return roleOverrides.delete(role);
  roleOverrides.set(role, [...expandKeys(keys)].filter((key) => ROLE_DEFAULT_KEYS.includes(key)));
}

// A role's default leaves now.
function roleDefaults(role) {
  if (roleOverrides.has(role)) return new Set(roleOverrides.get(role));
  return expandKeys(Object.hasOwn(ROLE_DEFAULTS, role) ? ROLE_DEFAULTS[role] : []);
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
    allowed = role ? roleDefaults(role) : new Set();
    for (const key of expandKeys(user?.permissionGrants)) allowed.add(key);
    for (const key of expandKeys(user?.permissionRevokes)) allowed.delete(key);
  }
  for (const key of IT_KEYS) allowed.delete(key);
  return allowed;
}

const isItUser = (user) => user?.isIT === true;
// An IT user the system account has not blocked.
const isUnblockedItUser = (user) => isItUser(user) && !user.itBlockedAt;

// An IT user with no everyday role works in System unseen, as «النظام» (owner,
// 2026-11-04). Computed from the record each time: a role or a block ends it.
function isHiddenIt(user, { systemTz } = {}) {
  return isUnblockedItUser(user) && !resolveRole(user) && !isSystemTz(user?.tz, systemTz);
}
// Whoever everyday lists and pickers leave out.
const isHiddenUser = (user) => Boolean(user) && (isSystemTz(user.tz) || (isItUser(user) && !resolveRole(user)));

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
// On the IT site isSystem stays false for an IT user with no role, who is still
// unseen in everything System shows.
const isUnseenActor = (actor) => Boolean(actor?.isSystem) || (actor?.it === true && isItUser(actor.user) && !resolveRole(actor.user));
const actorRef = (actor, ref) => (isUnseenActor(actor) ? SYSTEM_ACTOR : ref);
const actorDisplayName = (actor) =>
  (isUnseenActor(actor) ? SYSTEM_ACTOR_NAME : actor?.name || String(actor?.tz || ""));
// Who a lock names to others.
const lockOwner = (actor) => (isUnseenActor(actor)
  ? { name: SYSTEM_ACTOR_NAME, tz: "" }
  : { name: actor?.name, tz: actor?.tz });

module.exports = {
  SYSTEM_ACTOR,
  SYSTEM_ACTOR_NAME,
  actorRef,
  actorDisplayName,
  lockOwner,
  PERMISSION_TREE,
  ROLE_RANK,
  ROLE_DEFAULTS,
  IT_KEYS,
  GRANT_ONLY_MODULES,
  ALL_KEYS,
  ROLE_DEFAULT_KEYS,
  checkRoleDefaults,
  setRoleDefaultsOverride,
  roleDefaults,
  normalizeRole,
  resolveRole,
  expandKeys,
  effectivePermissions,
  isItUser,
  isUnblockedItUser,
  isHiddenIt,
  isHiddenUser,
  itPermissions,
  hasRealEmail,
  can,
  isSystemTz,
};
