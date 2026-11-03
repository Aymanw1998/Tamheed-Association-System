import { PERMISSION_TREE, ALL_KEYS, hasPermission } from "./permissionKeys";

test("vehicles has six leaves including delete", () => {
  expect(PERMISSION_TREE.vehicles).toEqual(["view", "edit", "compliance", "documents", "archive", "delete"]);
  expect(ALL_KEYS).toContain("vehicles.delete");
});

test("a leaf key needs that exact leaf", () => {
  expect(hasPermission(["students.view"], "students.view")).toBe(true);
  expect(hasPermission(["students.view"], "students.edit")).toBe(false);
});

test("a module key needs every leaf of the module", () => {
  const all = PERMISSION_TREE.students.map((l) => `students.${l}`);
  expect(hasPermission(all, "students")).toBe(true);
  expect(hasPermission(all.slice(1), "students")).toBe(false);
});

test("unknown keys and bad input are denied", () => {
  expect(hasPermission(["x.y"], "x.y")).toBe(false);
  expect(hasPermission(null, "students.view")).toBe(false);
  expect(hasPermission(["students.view"], "")).toBe(false);
});

test("lessons has a viewAll leaf", () => {
  expect(PERMISSION_TREE.lessons).toEqual(["view", "viewAll", "create", "edit", "roster", "delete", "copyMonth"]);
  expect(hasPermission(["lessons.viewAll"], "lessons.viewAll")).toBe(true);
});
