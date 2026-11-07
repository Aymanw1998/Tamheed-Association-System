import { PERMISSION_TREE, ALL_KEYS, IT_KEYS, hasPermission } from "./permissionKeys";
import catalog from "../generated/permissions.json";
import { accessStrings } from "../i18n/accessStrings";

test("permission labels and keys use the same canonical catalog, including weekly tasks", () => {
  expect(PERMISSION_TREE).toEqual(catalog.tree);
  expect(accessStrings.ar.perms.modules).toEqual(catalog.labels.ar.modules);
  expect(accessStrings.ar.perms.leavesByModule.tasks.manage).toBe("فتح صفحة تحديث المهمات");
  expect(accessStrings.ar.perms.modules.dashboard).toBe("الرئيسي");
  expect(accessStrings.ar.perms.modules.lessons).toBe("البرنامج");
  expect(ALL_KEYS).toContain("tasks.manage");
});

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

test("users has a resetPassword leaf and IT_KEYS mirrors the server's six IT keys", () => {
  expect(PERMISSION_TREE.users).toContain("resetPassword");
  expect([...IT_KEYS].sort()).toEqual(["audit.view", "permissions.manage", "storage.drive",
    "systemRecovery.reset", "users.passwords", "users.unlock"]);
  for (const key of IT_KEYS) expect(ALL_KEYS).toContain(key);
});
