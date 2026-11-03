import { countLessonsByDay, endOf, lessonDayOf, lessonsForDay, toHHMM } from "./lessonSchedule";

test.each([
  [840, "14:00"],
  [905, "15:05"],
  [0, "00:00"],
  [-5, "00:00"],
  [null, "00:00"],
])("minute %p shows as %p", (min, want) => {
  expect(toHHMM(min)).toBe(want);
});

test("a lesson without an end time lasts 45 minutes", () => {
  expect(endOf({ date: { day: 1, startMin: 840 } })).toBe(885);
});

const lesson = (name, day, startMin) => ({ name, date: { day, startMin, endMin: startMin + 45 } });

test("a day's lessons are sorted from the earliest start", () => {
  const lessons = [lesson("c", 2, 1020), lesson("x", 3, 600), lesson("a", 2, 840), lesson("b", 2, 900)];
  expect(lessonsForDay(lessons, 2).map((l) => l.name)).toEqual(["a", "b", "c"]);
});

test("a day stored as a string still matches", () => {
  expect(lessonsForDay([lesson("a", "4", 840)], 4).map((l) => l.name)).toEqual(["a"]);
});

test("lessons without a date are left out", () => {
  expect(lessonsForDay([{ name: "broken" }, lesson("a", 1, 840)], 1).map((l) => l.name)).toEqual(["a"]);
});

test("lesson counts are listed for Sunday through Saturday", () => {
  const lessons = [lesson("a", 1, 840), lesson("b", 1, 900), lesson("c", 7, 960), { name: "broken" }];
  expect(countLessonsByDay(lessons)).toEqual([2, 0, 0, 0, 0, 0, 1]);
});

test.each([
  ["2026-09-27T10:00:00", 1],
  ["2026-09-26T10:00:00", 7],
  ["2026-09-30T10:00:00", 4],
])("%s is lesson day %p", (iso, want) => {
  expect(lessonDayOf(new Date(iso))).toBe(want);
});
