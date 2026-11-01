import { hasPermission } from "./permissionKeys";

// Pages limited to a permission, checked in order (first match wins). Any other
// page behind login is open to every signed-in user. These mirror what the
// menu and the page buttons offer; the server enforces its own rules.
const RESTRICTED = [
  // The forms: only an admin edits by default (owner, 2026-11-01).
  { pattern: /^\/users\/new$/, key: "users.create" },
  { pattern: /^\/users\/[^/]+\/edit$/, key: "users.edit" },
  { pattern: /^\/students\/[^/]+\/edit$/, key: "students.edit" },
  { pattern: /^\/lessons\/[^/]+\/edit$/, key: "lessons.edit" },
  { pattern: /^\/users(\/|$)/, key: "users.view" },
  { pattern: /^\/notices(\/|$)/, key: "notices.view" },
  { pattern: /^\/students\/new$/, key: "students.create" },
  { pattern: /^\/students(\/|$)/, key: "students.view" },
  { pattern: /^\/lessons\/new$/, key: "lessons.create" },
  { pattern: /^\/vehicles(\/|$)/, key: "vehicles.view" },
  { pattern: /^\/sports(\/|$)/, any: ["sports.view", "sports.coach", "sports.manage"] },
  { pattern: /^\/audit(\/|$)/, key: "audit.view" },
];

export const canAccessPath = (pathname, permissions) => {
  const path = String(pathname || "").replace(/\/+$/, "") || "/";
  const rule = RESTRICTED.find(({ pattern }) => pattern.test(path));
  if (!rule) return true;
  return rule.any ? rule.any.some((key) => hasPermission(permissions, key)) : hasPermission(permissions, rule.key);
};

// Where a blocked page sends the user: their own user page (/users/<own tz>,
// or its form) opens their profile; anything else goes to the dashboard.
// null when the page is allowed.
export const blockedRedirect = (pathname, permissions, ownTz) => {
  if (canAccessPath(pathname, permissions)) return null;
  const own = String(pathname || "").match(/^\/users\/([^/]+)(?:\/edit)?\/?$/);
  return own && ownTz && own[1] === String(ownTz) ? "/profile" : "/dashboard";
};
