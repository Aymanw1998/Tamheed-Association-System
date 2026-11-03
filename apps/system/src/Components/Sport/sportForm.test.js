import { validateStats, validateJersey, validateLessonTimes, cardCells, birthDateLabel, lessonDaysLabel } from "./sportForm";

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

describe("validateLessonTimes", () => {
  test("accepts an end after the start", () => {
    expect(validateLessonTimes("16:00", "17:30")).toBeNull();
  });
  test.each([["16:00", "16:00"], ["17:00", "16:00"], ["", "16:00"], ["16:00", ""]])("rejects %s - %s", (a, b) => {
    expect(validateLessonTimes(a, b)).toEqual(expect.any(String));
  });
});

describe("card helpers", () => {
  const labels = { attendance: "الحضور", lates: "التأخير" };
  test("cardCells puts attendance and lates first, then up to 4 stats", () => {
    const defs = ["a", "b", "c", "d", "e"].map((k) => ({ key: k, label: k }));
    const cells = cardCells({ attendance: { rate: 80, late: 2 }, values: { a: 3 } }, defs, labels);
    expect(cells).toHaveLength(6);
    expect(cells[0]).toEqual({ label: "الحضور", value: "80%" });
    expect(cells[1]).toEqual({ label: "التأخير", value: "2" });
    expect(cells[2]).toEqual({ label: "a", value: "3" });
    expect(cells[3].value).toBe("0");
  });
  test("cardCells shows a dash without attendance", () => {
    expect(cardCells({}, [], labels)[0].value).toBe("—");
  });
  test("birthDateLabel", () => {
    expect(birthDateLabel("2012-05-09")).toBe("09/05/2012");
    expect(birthDateLabel(null)).toBe("—");
  });
  test("lessonDaysLabel lists each day once in week order", () => {
    const names = ["أ", "ب", "ج", "د", "ه", "و", "ز"];
    expect(lessonDaysLabel([{ day: 3 }, { day: 1 }, { day: 3 }], names)).toBe("أ، ج");
    expect(lessonDaysLabel([], names)).toBe("—");
  });
});
