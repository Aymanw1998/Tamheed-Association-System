import { validateStats, validateJersey } from "./sportForm";

describe("validateStats", () => {
  const labels = (...l) => l.map((label) => ({ label }));
  test.each([0, 1, 4])("accepts %s non-blank stats", (n) => {
    expect(validateStats(labels(...["أهداف", "تمريرات", "تصديات", "أخطاء"].slice(0, n)))).toEqual({});
  });
  test("rejects 5 stats", () => {
    expect(validateStats(labels("a", "b", "c", "d", "e")).list).toEqual(expect.any(String));
  });
  test("rejects a blank label and points at its index", () => {
    const errors = validateStats(labels("أهداف", "  "));
    expect(errors[1]).toEqual(expect.any(String));
    expect(errors[0]).toBeUndefined();
  });
  test("treats a missing list as empty", () => {
    expect(validateStats(undefined)).toEqual({});
  });
});

describe("validateJersey", () => {
  test.each(["0", "100", "7.5", "abc", "-3"])("rejects %s", (v) => {
    expect(validateJersey(v)).toEqual(expect.any(String));
  });
  test.each(["", "10", "1", "99", null, undefined])("accepts %s", (v) => {
    expect(validateJersey(v)).toBeNull();
  });
});
