import { attendanceDateLabel } from "./attendanceDates";

test.each([
  [{ year: 2026, month: 9, day: 26, ymd: "26/09/2026" }, "السبت 26/09/2026"],
  [{ year: 2026, month: 9, day: 27, ymd: "27/09/2026" }, "الاحد 27/09/2026"],
  [{ year: 2026, month: 1, day: 1, ymd: "01/01/2026" }, "الخميس 01/01/2026"],
])("%o is shown as %p", (date, want) => {
  expect(attendanceDateLabel(date)).toBe(want);
});

test("a date without parts shows just its text", () => {
  expect(attendanceDateLabel({ ymd: "01/02/2026" })).toBe("01/02/2026");
});
