import { ADMIN_ROLES, GUIDE_ROLES } from "./session";

const STAFF_ROLES = [...ADMIN_ROLES, ...GUIDE_ROLES];

// Pages limited to some roles, checked in order (first match wins). Any other
// page behind login is open to every signed-in user. These mirror what the
// menu and the page buttons offer each role; the server enforces its own rules.
const RESTRICTED = [
  { pattern: /^\/users(\/|$)/, roles: ADMIN_ROLES },
  { pattern: /^\/students\/new$/, roles: ADMIN_ROLES },
  { pattern: /^\/students(\/|$)/, roles: STAFF_ROLES },
  { pattern: /^\/lessons\/new$/, roles: ADMIN_ROLES },
];

export const canAccessPath = (pathname, roles) => {
  const path = String(pathname || "").replace(/\/+$/, "") || "/";
  const rule = RESTRICTED.find(({ pattern }) => pattern.test(path));
  if (!rule) return true;
  return rule.roles.some((role) => roles.includes(role));
};
