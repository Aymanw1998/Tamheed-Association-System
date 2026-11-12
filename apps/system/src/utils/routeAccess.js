import { hasPermission } from "./permissionKeys";

// Business pages require an explicit permission rule (first match wins).
// Only listed personal/help pages bypass it; unknown sections fail closed.
// The server independently enforces permissions and record scope.
const RESTRICTED = [
  { pattern: /^\/dashboard(\/|$)/, key: "dashboard.view" },
  { pattern: /^\/association-rules(\/|$)/, key: "rules.view" },
  // The forms: only an admin edits by default (owner, 2026-11-01).
  { pattern: /^\/weekly-tasks\/manage$/, all: ["tasks.manage", "tasks.viewAll"] },
  { pattern: /^\/weekly-tasks(\/|$)/, any: ["tasks.view", "tasks.viewAll"] },
  { pattern: /^\/users\/new$/, key: "users.create" },
  { pattern: /^\/users\/[^/]+\/edit$/, key: "users.edit" },
  { pattern: /^\/students\/[^/]+\/edit$/, key: "students.edit" },
  // Wall display screens (owner, 2026-11-12): their own key, not lessons.view.
  { pattern: /^\/lessons\/displays$/, key: "displays.manage" },
  { pattern: /^\/lessons\/[^/]+\/edit$/, key: "lessons.edit" },
  { pattern: /^\/users(\/|$)/, key: "users.view" },
  { pattern: /^\/notices(\/|$)/, key: "notices.view" },
  { pattern: /^\/students\/new$/, key: "students.create" },
  { pattern: /^\/students(\/|$)/, key: "students.view" },
  { pattern: /^\/lessons\/new$/, key: "lessons.create" },
  { pattern: /^\/lessons$/, all: ["lessons.view", "calendar.view"] },
  { pattern: /^\/vehicles(\/|$)/, key: "vehicles.view" },
  { pattern: /^\/sports(\/|$)/, any: ["sports.view", "sports.coach", "sports.manage"] },
  // A section taken away closes too (owner, 2026-11-03), as on the server.
  { pattern: /^\/calendar(\/|$)/, key: "attendance.view" },
  { pattern: /^\/lessons(\/|$)/, key: "lessons.view" },
  { pattern: /^\/reports(\/|$)/, any: ["reports.create", "reports.editOwn", "reports.viewAll", "reports.editAll", "reports.delete", "reports.exportPdf"] },
  { pattern: /^\/files(\/|$)/, key: "files.use" },
];

export const canAccessPath = (pathname, permissions) => {
  const path = String(pathname || "").replace(/\/+$/, "") || "/";
  const rule = RESTRICTED.find(({ pattern }) => pattern.test(path));
  if (!rule) return ["/", "/profile", "/guide"].includes(path);
  return rule.all ? rule.all.every((key) => hasPermission(permissions, key)) : rule.any ? rule.any.some((key) => hasPermission(permissions, key)) : hasPermission(permissions, rule.key);
};

// Where a blocked page sends the user: their own user page (/users/<own tz>,
// or its form) opens their profile; anything else goes to the dashboard.
// null when the page is allowed.
export const blockedRedirect = (pathname, permissions, ownTz) => {
  if (canAccessPath(pathname, permissions)) return null;
  const own = String(pathname || "").match(/^\/users\/([^/]+)(?:\/edit)?\/?$/);
  return own && ownTz && own[1] === String(ownTz) ? "/profile" : canAccessPath("/dashboard", permissions) ? "/dashboard" : "/profile";
};
