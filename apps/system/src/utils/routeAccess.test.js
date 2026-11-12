import { canAccessPath, blockedRedirect } from "./routeAccess";

const ADMIN = ["dashboard.view", "calendar.view", "tasks.view", "users.view", "users.create", "users.edit", "notices.view", "students.view", "students.create", "students.edit",
  "lessons.view", "lessons.create", "lessons.edit", "vehicles.view", "audit.view",
  "attendance.view", "reports.create", "reports.viewAll", "files.use"];
// Only an admin edits students, lessons and users (owner, 2026-11-01).
const GUIDE = ["dashboard.view", "calendar.view", "tasks.view", "students.view", "lessons.view", "attendance.view", "reports.create", "files.use"];
const ASSISTANT = ["dashboard.view", "calendar.view", "lessons.view", "attendance.view", "reports.create", "files.use"];

test.each([
  ["/dashboard", true, true, true],
  ["/calendar", true, true, true],
  ["/profile", true, true, true],
  ["/files", true, true, true],
  ["/lessons", true, true, true],
  ["/lessons/6ab7d576de1b6cee14016499", true, true, true],
  ["/lessons/new", true, false, false],
  ["/reports", true, true, true],
  ["/reports/new", true, true, true],
  ["/students", true, true, false],
  ["/students/990000036", true, true, false],
  ["/students/990000036/edit", true, false, false],
  ["/lessons/6ab7d576de1b6cee14016499/edit", true, false, false],
  ["/users/990000010/edit", true, false, false],
  ["/students/new", true, false, false],
  ["/users", true, false, false],
  ["/users/new", true, false, false],
  ["/users/990000010", true, false, false],
  ["/notices", true, false, false],
  ["/vehicles", true, false, false],
])("%s: admin=%s guide=%s assistant=%s", (path, admin, guide, assistant) => {
  expect(canAccessPath(path, ADMIN)).toBe(admin);
  expect(canAccessPath(path, GUIDE)).toBe(guide);
  expect(canAccessPath(path, ASSISTANT)).toBe(assistant);
});

test("a trailing slash does not bypass a restricted page", () => {
  expect(canAccessPath("/users/", GUIDE)).toBe(false);
  expect(canAccessPath("/students/new/", GUIDE)).toBe(false);
});

test("/users is denied without users.view", () => {
  expect(canAccessPath("/users", ["students.view"])).toBe(false);
});

test("a user without permissions (legacy session) only reaches the shared pages", () => {
  expect(canAccessPath("/dashboard", [])).toBe(false);
  expect(canAccessPath("/students", [])).toBe(false);
  expect(canAccessPath("/users", undefined)).toBe(false);
});

test("/sports needs any of sports.view, coach or manage", () => {
  expect(canAccessPath("/sports", ["sports.coach"])).toBe(true);
  expect(canAccessPath("/sports", ["sports.manage"])).toBe(true);
  expect(canAccessPath("/sports", ["sports.view"])).toBe(true);
  expect(canAccessPath("/sports", [])).toBe(false);
  expect(canAccessPath("/sports/", ["students.view"])).toBe(false);
});

test("a guide or assistant opening their own user page goes to /profile", () => {
  expect(blockedRedirect("/users/990000010", GUIDE, "990000010")).toBe("/profile");
  expect(blockedRedirect("/users/990000010/edit", ASSISTANT, "990000010")).toBe("/profile");
});

test("any other blocked page goes to the dashboard", () => {
  expect(blockedRedirect("/users/990000099", GUIDE, "990000010")).toBe("/dashboard");
  expect(blockedRedirect("/users", GUIDE, "990000010")).toBe("/dashboard");
  expect(blockedRedirect("/students/1/edit", GUIDE, "")).toBe("/dashboard");
  expect(blockedRedirect("/users/", GUIDE, "")).toBe("/dashboard");
});

test("an allowed page is not redirected", () => {
  expect(blockedRedirect("/users/990000010", ADMIN, "990000010")).toBe(null);
  expect(blockedRedirect("/lessons/abc", GUIDE, "1")).toBe(null);
});

test("unclassified business pages fail closed and a revoked dashboard falls back to profile", () => {
  expect(canAccessPath("/new-business-section", ADMIN)).toBe(false);
  expect(canAccessPath("/weekly-tasks", ["tasks.view"])).toBe(true);
  expect(canAccessPath("/weekly-tasks", [])).toBe(false);
  expect(blockedRedirect("/dashboard", [], "me")).toBe("/profile");
  expect(canAccessPath("/association-rules", ["students.parentLink"])).toBe(false);
  expect(canAccessPath("/lessons", ["lessons.view"])).toBe(false);
  expect(canAccessPath("/lessons/record", ["lessons.view"])).toBe(true);
});


// Owner, 2026-11-03: a section taken away disappears from the menu and its
// page is closed, like the others: attendance, lessons, reports and files.
test.each([
  ["/calendar", ["attendance.view"]],
  ["/lessons", ["lessons.view", "calendar.view"]],
  ["/lessons/6ab7d576de1b6cee14016499", ["lessons.view"]],
  ["/reports", ["reports.create"]],
  ["/reports", ["reports.viewAll"]],
  ["/reports/new", ["reports.create"]],
  ["/files", ["files.use"]],
  ["/association-rules", ["rules.view"]],
])("%s opens with %j and is closed with no key of its section", (path, keys) => {
  expect(canAccessPath(path, keys)).toBe(true);
  expect(canAccessPath(path, ["dashboard.view", "calendar.view", "students.view"])).toBe(false);
});

test("/lessons/displays needs displays.manage only", () => {
  expect(canAccessPath("/lessons/displays", ["displays.manage"])).toBe(true);
  expect(canAccessPath("/lessons/displays", ["lessons.view", "calendar.view"])).toBe(false);
});
