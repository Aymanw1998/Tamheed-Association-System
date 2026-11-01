import { attendanceTotals, monthKeys, inMonth, monthLabel, statusTone } from "./attendanceView";

const row = (year, month, day, status) => ({ year, month, day, status, dateKey: year * 10000 + month * 100 + day });
const ROWS = [
  row(2026, 10, 29, "غائب"),
  row(2026, 10, 22, "حاضر"),
  row(2026, 10, 15, "متأخر"),
  row(2026, 9, 30, "حاضر"),
];

test("totals count each status; late counts as attended in the rate", () => {
  expect(attendanceTotals(ROWS)).toEqual({ total: 4, present: 2, late: 1, absent: 1, rate: 75 });
});

test("with no rows the rate is null, not 0", () => {
  expect(attendanceTotals([])).toEqual({ total: 0, present: 0, late: 0, absent: 0, rate: null });
});

test("months are listed once each, newest first", () => {
  expect(monthKeys(ROWS)).toEqual(["2026-10", "2026-09"]);
});

test("a month keeps only its own rows; 'all' keeps every row", () => {
  expect(inMonth(ROWS, "2026-09")).toHaveLength(1);
  expect(inMonth(ROWS, "all")).toHaveLength(4);
});

test("a month reads as its Arabic name and year", () => {
  expect(monthLabel("2026-10")).toBe("أكتوبر 2026");
});

test("each status has its colour tone; an unknown one is neutral", () => {
  expect(statusTone("حاضر")).toBe("present");
  expect(statusTone("غائب")).toBe("absent");
  expect(statusTone("متأخر")).toBe("late");
  expect(statusTone("؟")).toBe("other");
});
