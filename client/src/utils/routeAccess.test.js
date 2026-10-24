import { canAccessPath } from "./routeAccess";

const ADMIN = ["users.view", "notices.view", "students.view", "students.create", "lessons.create", "vehicles.view", "audit.view"];
const GUIDE = ["students.view", "lessons.create"];
const ASSISTANT = ["dashboard.view"];

test.each([
  ["/dashboard", true, true, true],
  ["/calendar", true, true, true],
  ["/profile", true, true, true],
  ["/files", true, true, true],
  ["/lessons", true, true, true],
  ["/lessons/6ab7d576de1b6cee14016499", true, true, true],
  ["/lessons/new", true, true, false],
  ["/reports", true, true, true],
  ["/reports/new", true, true, true],
  ["/students", true, true, false],
  ["/students/990000036", true, true, false],
  ["/students/new", true, false, false],
  ["/users", true, false, false],
  ["/users/new", true, false, false],
  ["/users/990000010", true, false, false],
  ["/notices", true, false, false],
  ["/vehicles", true, false, false],
  ["/audit", true, false, false],
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
  expect(canAccessPath("/dashboard", [])).toBe(true);
  expect(canAccessPath("/students", [])).toBe(false);
  expect(canAccessPath("/users", undefined)).toBe(false);
});

test("/sports needs sports.view", () => {
  expect(canAccessPath("/sports", ["sports.view"])).toBe(true);
  expect(canAccessPath("/sports", [])).toBe(false);
  expect(canAccessPath("/sports/", ["students.view"])).toBe(false);
});
