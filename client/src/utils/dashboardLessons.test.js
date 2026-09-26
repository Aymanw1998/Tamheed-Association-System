import { dashboardLessons } from "./dashboardLessons";

const L = (id, day, startMin, endMin, extra = {}) => ({ _id: id, name: id, date: { day, startMin, endMin }, ...extra });

// 2026-09-27 is a Sunday (lesson day 1).
const at = (hh, mm) => new Date(2026, 8, 27, hh, mm);

const LESSONS = [
  L("sun14", 1, 840, 885, { teacher: "t1", helper: "h1" }),
  L("sun15", 1, 900, 945, { teacher: "t2", helper: "h1" }),
  L("sun16", 1, 960, 1005, { teacher: "t1" }),
  L("mon14", 2, 840, 885, { teacher: "t2" }),
  L("wed10", 4, 600, 645, { teacher: "t1" }),
];

const ids = (items) => items.map((item) => `${item.lesson._id}:${item.state}`);

test("today's lessons are marked done, now, next, and later", () => {
  const result = dashboardLessons(LESSONS, at(15, 10), { isAdmin: true });
  expect(ids(result.today)).toEqual(["sun14:done", "sun15:now", "sun16:next"]);
  expect(result.upcoming).toBeNull();
});

test("before the first lesson, the first one is next", () => {
  const result = dashboardLessons(LESSONS, at(9, 0), { isAdmin: true });
  expect(ids(result.today)).toEqual(["sun14:next", "sun15:later", "sun16:later"]);
});

test("after the last lesson, today stays for attendance and the next day is added", () => {
  const result = dashboardLessons(LESSONS, at(20, 0), { isAdmin: true });
  expect(ids(result.today)).toEqual(["sun14:done", "sun15:done", "sun16:done"]);
  expect(result.upcoming.day).toBe(2);
  expect(result.upcoming.lessons.map((l) => l._id)).toEqual(["mon14"]);
});

test("a day without lessons shows the nearest day that has some", () => {
  const tuesday = new Date(2026, 8, 29, 9, 0);
  const result = dashboardLessons(LESSONS, tuesday, { isAdmin: true });
  expect(result.today).toEqual([]);
  expect(result.upcoming.day).toBe(4);
  expect(result.upcoming.lessons.map((l) => l._id)).toEqual(["wed10"]);
});

test("the search for the next day wraps around the week", () => {
  const thursday = new Date(2026, 9, 1, 9, 0);
  expect(dashboardLessons(LESSONS, thursday, { isAdmin: true }).upcoming.day).toBe(1);
});

test("a guide or assistant sees only lessons they teach or help in", () => {
  const guide = dashboardLessons(LESSONS, at(9, 0), { isAdmin: false, userId: "t1" });
  expect(ids(guide.today)).toEqual(["sun14:next", "sun16:later"]);
  const assistant = dashboardLessons(LESSONS, at(9, 0), { isAdmin: false, userId: "h1" });
  expect(ids(assistant.today)).toEqual(["sun14:next", "sun15:later"]);
});

test("nothing at all returns an empty today and no upcoming day", () => {
  expect(dashboardLessons([], at(9, 0), { isAdmin: true })).toEqual({ today: [], upcoming: null });
});
