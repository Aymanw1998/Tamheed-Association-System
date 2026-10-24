import { validateSport, validateJersey } from "./sportForm";

describe("validateSport", () => {
  test("a valid sport has no errors", () => {
    expect(validateSport({ name: "كرة القدم", icon: "⚽", stats: [{ label: "أهداف" }] })).toEqual({});
  });
  test("a name is required", () => {
    expect(validateSport({ name: "  ", icon: "", stats: [] }).name).toBeTruthy();
  });
  test("rejects 5 stats", () => {
    const stats = ["a", "b", "c", "d", "e"].map((label) => ({ label }));
    expect(validateSport({ name: "x", icon: "", stats }).stats).toBeTruthy();
  });
  test("rejects blank stat labels", () => {
    expect(validateSport({ name: "x", icon: "", stats: [{ label: " " }] }).stats).toBeTruthy();
  });
  test("rejects an icon longer than 4 characters", () => {
    expect(validateSport({ name: "x", icon: "abcde", stats: [] }).icon).toBeTruthy();
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
