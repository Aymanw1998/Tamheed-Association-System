import { canAccessPath } from "./routeAccess";

const ADMIN = ["ادارة"];
const GUIDE = ["مرشد"];
const ASSISTANT = ["مساعد"];

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
  ["/reports/6ab7d576de1b6cee14016499", true, true, true],
  ["/students", true, true, false],
  ["/students/990000036", true, true, false],
  ["/students/new", true, false, false],
  ["/users", true, false, false],
  ["/users/new", true, false, false],
  ["/users/990000010", true, false, false],
])("%s: admin=%s guide=%s assistant=%s", (path, admin, guide, assistant) => {
  expect(canAccessPath(path, ADMIN)).toBe(admin);
  expect(canAccessPath(path, GUIDE)).toBe(guide);
  expect(canAccessPath(path, ASSISTANT)).toBe(assistant);
});

test("a trailing slash does not bypass a restricted page", () => {
  expect(canAccessPath("/users/", GUIDE)).toBe(false);
  expect(canAccessPath("/students/new/", GUIDE)).toBe(false);
});

test("alternate spellings of the admin role are admins", () => {
  expect(canAccessPath("/users", ["الإدارة"])).toBe(true);
});

test("a user without roles only reaches the shared pages", () => {
  expect(canAccessPath("/dashboard", [])).toBe(true);
  expect(canAccessPath("/students", [])).toBe(false);
  expect(canAccessPath("/users", [])).toBe(false);
});
