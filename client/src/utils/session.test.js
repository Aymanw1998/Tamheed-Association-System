import { getStoredRoles, getStoredUserId, rememberSessionUser } from "./session";

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
