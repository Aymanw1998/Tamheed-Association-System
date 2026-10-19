import { canStored, getStoredPermissions, getStoredRole, getStoredRoles, getStoredUserId, isStoredSystem, rememberSessionUser } from "./session";

beforeEach(() => localStorage.clear());

test("a signed-in user's id and role are stored for the pages to read", () => {
  rememberSessionUser({ _id: "u1", roles: ["ادارة"] });
  expect(getStoredUserId()).toBe("u1");
  expect(getStoredRoles()).toEqual(["ادارة"]);
});

test("a user with two roles keeps both", () => {
  rememberSessionUser({ _id: "u2", roles: ["مرشد", "مساعد"] });
  expect(getStoredRoles()).toEqual(["مرشد", "مساعد"]);
});

test("a session restored after storage was cleared gets its role back", () => {
  rememberSessionUser({ _id: "u1", roles: ["ادارة"] });
  localStorage.clear();
  expect(getStoredRoles()).toEqual([]);
  rememberSessionUser({ _id: "u1", roles: ["ادارة"] });
  expect(getStoredRoles()).toEqual(["ادارة"]);
});

test("roles saved by older versions as comma-separated text are still read", () => {
  localStorage.setItem("roles", "مرشد,مساعد");
  expect(getStoredRoles()).toEqual(["مرشد", "مساعد"]);
});

test("a missing user leaves the stored values alone", () => {
  rememberSessionUser({ _id: "u1", roles: ["مرشد"] });
  rememberSessionUser(null);
  expect(getStoredRoles()).toEqual(["مرشد"]);
});

test("permissions and role are stored when the server returns them", () => {
  rememberSessionUser({ _id: "u1", roles: ["مرشد"], permissions: ["students.view"], role: "مرشد" });
  expect(getStoredPermissions()).toEqual(["students.view"]);
  expect(canStored("students.view")).toBe(true);
  expect(canStored("students.edit")).toBe(false);
});

test("permissions can also arrive on the user object", () => {
  rememberSessionUser({ _id: "u1", permissions: ["users.view"], role: "ادارة" });
  expect(canStored("users.view")).toBe(true);
  expect(localStorage.getItem("role")).toBe("ادارة");
});

test("canStored on a module needs every leaf", () => {
  const leaves = ["students.view", "students.viewAll", "students.create", "students.edit", "students.delete", "students.photo"];
  rememberSessionUser({ _id: "u1", permissions: leaves });
  expect(canStored("students")).toBe(false);
  rememberSessionUser({ _id: "u1", permissions: [...leaves, "students.parentLink"] });
  expect(canStored("students")).toBe(true);
});

test("legacy storage with roles only has no permissions and does not crash", () => {
  localStorage.setItem("roles", JSON.stringify(["ادارة"]));
  expect(getStoredPermissions()).toEqual([]);
  expect(canStored("users.view")).toBe(false);
  localStorage.setItem("permissions", "not json");
  expect(getStoredPermissions()).toEqual([]);
});

test("only a user flagged isSystem is remembered as the system account", () => {
  rememberSessionUser({ _id: "s0", roles: ["ادارة"], isSystem: true });
  expect(isStoredSystem()).toBe(true);
  // The next sign-in (or /auth/me refresh) of anyone else clears the flag.
  rememberSessionUser({ _id: "u1", roles: ["ادارة"] });
  expect(isStoredSystem()).toBe(false);
  rememberSessionUser({ _id: "u1", roles: ["ادارة"], isSystem: "yes" });
  expect(isStoredSystem()).toBe(false);
});

test("getStoredRole resolves the stored role, preferring the single role", () => {
  rememberSessionUser({ _id: "u1", role: "مرشد", roles: ["مرشد"] });
  expect(getStoredRole()).toBe("مرشد");
  localStorage.clear();
  localStorage.setItem("roles", JSON.stringify(["مساعد", "الإدارة"]));
  expect(getStoredRole()).toBe("ادارة");
});
