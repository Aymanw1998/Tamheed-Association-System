import { hasPermission } from "./permissionKeys";

// Pages limited to a permission, checked in order (first match wins). Any other
// page behind login is open to every signed-in user. These mirror what the
// menu and the page buttons offer; the server enforces its own rules.
const RESTRICTED = [
  { pattern: /^\/users(\/|$)/, key: "users.view" },
  { pattern: /^\/notices(\/|$)/, key: "notices.view" },
  { pattern: /^\/students\/new$/, key: "students.create" },
  { pattern: /^\/students(\/|$)/, key: "students.view" },
  { pattern: /^\/lessons\/new$/, key: "lessons.create" },
  { pattern: /^\/vehicles(\/|$)/, key: "vehicles.view" },
  { pattern: /^\/audit(\/|$)/, key: "audit.view" },
];

export const canAccessPath = (pathname, permissions) => {
  const path = String(pathname || "").replace(/\/+$/, "") || "/";
  const rule = RESTRICTED.find(({ pattern }) => pattern.test(path));
  if (!rule) return true;
  return hasPermission(permissions, rule.key);
};
