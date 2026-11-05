import { EMPTY_REPORT_FILTERS, countReportFilters, matchesReportFilters } from "./reportFilters";

const dateOf = (value) => (value ? new Date(value) : null);
const report = { date: "2026-11-03T18:00:00", stitle: "اجتماع الأهل", title: ["زيارة بيت", "متابعة الدراسة"], user: { firstname: "أحمد", lastname: "عفيفي" } };
const match = (filters) => matchesReportFilters(report, { ...EMPTY_REPORT_FILTERS, ...filters }, dateOf);

test("no filter keeps everything", () => {
  expect(match({})).toBe(true);
  expect(countReportFilters(EMPTY_REPORT_FILTERS)).toBe(0);
});

test("both dates count as whole days", () => {
  expect(match({ dateFrom: "2026-11-03" })).toBe(true);
  expect(match({ dateTo: "2026-11-03" })).toBe(true);
  expect(match({ dateFrom: "2026-11-04" })).toBe(false);
  expect(match({ dateTo: "2026-11-02" })).toBe(false);
  expect(match({ dateFrom: "2026-11-01", dateTo: "2026-11-30" })).toBe(true);
});

test("a report with no date is out when a date is asked for", () => {
  expect(matchesReportFilters({ ...report, date: null }, { ...EMPTY_REPORT_FILTERS, dateFrom: "2026-11-01" }, dateOf)).toBe(false);
});

test("the writer matches by a part of the name, first or last", () => {
  expect(match({ createBy: "عفيف" })).toBe(true);
  expect(match({ createBy: "أحمد" })).toBe(true);
  expect(match({ createBy: "سامر" })).toBe(false);
});

test("a report with no known writer is out when a writer is asked for", () => {
  expect(matchesReportFilters({ ...report, user: null }, { ...EMPTY_REPORT_FILTERS, createBy: "أحمد" }, dateOf)).toBe(false);
});

test("a secondary title matches by a part of any of them", () => {
  expect(match({ title: "زيار" })).toBe(true);
  expect(match({ title: "الدراسة" })).toBe(true);
  expect(match({ title: "مالية" })).toBe(false);
});

test("the main title matches by a part too, and filters add up", () => {
  expect(match({ stitle: "الأهل" })).toBe(true);
  expect(match({ stitle: "الأهل", createBy: "سامر" })).toBe(false);
  expect(countReportFilters({ ...EMPTY_REPORT_FILTERS, stitle: "x", dateTo: "2026-11-01" })).toBe(2);
});
