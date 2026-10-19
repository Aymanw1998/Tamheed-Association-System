import { ROLES, normalizeRole, resolveRole, assignableRoles, isDemotion, canManageTargetClient } from "./roles";

test("roles are listed highest first", () => {
  expect(ROLES).toEqual(["ادارة", "مرشد", "مساعد"]);
});

test("normalizeRole maps spellings and drops unknown values", () => {
  expect(normalizeRole("الإدارة")).toBe("ادارة");
  expect(normalizeRole(" مرشدة ")).toBe("مرشد");
  expect(normalizeRole("x")).toBe(null);
  expect(normalizeRole(null)).toBe(null);
});

test("resolveRole prefers role, then the highest of roles", () => {
  expect(resolveRole({ role: "مساعد", roles: ["ادارة"] })).toBe("مساعد");
  expect(resolveRole({ roles: ["مساعد", "مرشد"] })).toBe("مرشد");
  expect(resolveRole({ roles: [] })).toBe(null);
  expect(resolveRole(null)).toBe(null);
});

test("assignableRoles: only roles strictly below one's own, whatever one's permissions", () => {
  expect(assignableRoles({ role: "ادارة" })).toEqual(["مرشد", "مساعد"]);
  expect(assignableRoles({ role: "الإدارة" })).toEqual(["مرشد", "مساعد"]);
  expect(assignableRoles({ role: "مرشد" })).toEqual(["مساعد"]);
  expect(assignableRoles({ role: "مساعد" })).toEqual([]);
  expect(assignableRoles({ role: null })).toEqual([]);
  // users.changeRole does not lift the rank limit (the server enforces it too).
  expect(assignableRoles({ role: "ادارة", permissions: ["users.changeRole"] })).toEqual(["مرشد", "مساعد"]);
});

test("assignableRoles: the system account is offered every role", () => {
  expect(assignableRoles({ role: null, isSystem: true })).toEqual(ROLES);
  expect(assignableRoles({ role: "مساعد", isSystem: true })).toEqual(ROLES);
  expect(assignableRoles({ role: "مساعد", isSystem: "yes" })).toEqual([]);
});

test("isDemotion only when moving to a lower rank from a known role", () => {
  expect(isDemotion("ادارة", "مرشد")).toBe(true);
  expect(isDemotion("مساعد", "مرشد")).toBe(false);
  expect(isDemotion("مرشد", "مرشد")).toBe(false);
  expect(isDemotion(null, "مساعد")).toBe(false);
});

describe("canManageTargetClient mirrors canManageTarget for hiding actions", () => {
  const admin = { id: "a1", role: "ادارة" };
  test("the system viewer manages anyone", () => {
    expect(canManageTargetClient({ isSystem: true }, { _id: "x", roles: ["ادارة"] })).toBe(true);
  });
  test("nobody manages himself (matched by _id or tz)", () => {
    expect(canManageTargetClient(admin, { _id: "a1", roles: ["مساعد"] })).toBe(false);
    expect(canManageTargetClient({ tz: "t1", role: "ادارة" }, { _id: "z", tz: "t1" })).toBe(false);
  });
  test("the target must rank strictly below the viewer", () => {
    expect(canManageTargetClient(admin, { _id: "g", roles: ["مرشد"] })).toBe(true);
    expect(canManageTargetClient(admin, { _id: "g", role: "مساعد" })).toBe(true);
    expect(canManageTargetClient(admin, { _id: "b", roles: ["الإدارة"] })).toBe(false);
    expect(canManageTargetClient({ id: "g", role: "مرشد" }, { _id: "a", roles: ["ادارة"] })).toBe(false);
  });
  test("a target with an unknown or no role ranks 0", () => {
    expect(canManageTargetClient({ id: "h", role: "مساعد" }, { _id: "w", roles: [] })).toBe(true);
    expect(canManageTargetClient({ id: "h", role: "مساعد" }, { _id: "w", role: "nonsense" })).toBe(true);
    expect(canManageTargetClient({ id: "n", role: null }, { _id: "w" })).toBe(false);
  });
  test("no viewer or no target manages nothing", () => {
    expect(canManageTargetClient(null, { _id: "w" })).toBe(false);
    expect(canManageTargetClient(admin, null)).toBe(false);
  });
});
