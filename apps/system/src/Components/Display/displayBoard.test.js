import {
  DAY_NAMES, byDay, clearFeed, clockOffset, comingDays, israelDayMinute, loadFeed, loadStored, markDay, rotationDays, saveFeed, weekDays,
} from "./displayBoard";

// Wall display board (owner, 2026-11-12): today and now follow Israel time
// from the server, whatever the TV's own clock says.

const L = (name, day, startMin, endMin) => ({ name, day, startMin, endMin, room: "1", guide: null, kind: "lesson" });

describe("israelDayMinute", () => {
  test("Tuesday 16:20 in Israel (UTC+2 in November)", () => {
    expect(israelDayMinute(Date.parse("2026-11-10T14:20:00Z"))).toEqual({ day: 3, minute: 980, date: "10/11/2026", time: "16:20" });
  });
  test("just after midnight in Israel is already the next day", () => {
    const at = israelDayMinute(Date.parse("2026-11-10T22:05:00Z"));
    expect(at.day).toBe(4);
    expect(at.minute).toBe(5);
    expect(at.time).toBe("00:05");
  });
  test("summer time (UTC+3)", () => {
    expect(israelDayMinute(Date.parse("2026-07-05T13:00:00Z")).minute).toBe(960);
  });
  test("a TV clock 3 hours fast still lands on the server's Israel time", () => {
    const localNow = Date.parse("2026-11-10T17:20:00Z");
    const offset = clockOffset("2026-11-10T14:20:00Z", localNow);
    expect(israelDayMinute(localNow + offset).minute).toBe(980);
    expect(israelDayMinute(localNow + 60000 + offset).minute).toBe(981);
  });
  test("a bad server time gives no offset", () => {
    expect(clockOffset("nonsense", 1000)).toBe(0);
    expect(clockOffset(undefined, 1000)).toBe(0);
  });
});

test("byDay groups 1..7 and sorts by start", () => {
  const grouped = byDay([L("b", 2, 900, 960), L("a", 2, 600, 660), L("x", 9, 1, 2), L("s", 7, 1, 2)]);
  expect(Object.keys(grouped)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  expect(grouped[2].map((l) => l.name)).toEqual(["a", "b"]);
  expect(grouped[7].map((l) => l.name)).toEqual(["s"]);
  expect(byDay(null)[1]).toEqual([]);
});

test("markDay: overlapping lessons are all now, all earliest next", () => {
  const marked = markDay([L("p", 3, 840, 900), L("n1", 3, 960, 1050), L("n2", 3, 960, 1050), L("x1", 3, 1050, 1110), L("x2", 3, 1050, 1110), L("later", 3, 1110, 1170)], 980);
  expect(marked.map((l) => [l.name, l.state])).toEqual([
    ["p", "past"], ["n1", "now"], ["n2", "now"], ["x1", "next"], ["x2", "next"], ["later", "later"],
  ]);
  expect(marked[0].name).toBe("p");
});

test("markDay: a lesson ends at its end minute", () => {
  expect(markDay([L("a", 1, 600, 660)], 660)[0].state).toBe("past");
  expect(markDay([L("a", 1, 600, 660)], 600)[0].state).toBe("now");
  expect(markDay([L("a", 1, 600, 660)], 599)[0].state).toBe("next");
});

test("weekDays: Sunday to Thursday always, Friday and Saturday only with lessons", () => {
  expect(weekDays(byDay([]))).toEqual([1, 2, 3, 4, 5]);
  expect(weekDays(byDay([L("s", 7, 600, 660)]))).toEqual([1, 2, 3, 4, 5, 7]);
});

test("comingDays starts tomorrow, wraps, skips empty days and today", () => {
  const grouped = byDay([L("a", 1, 600, 660), L("b", 3, 600, 660), L("c", 5, 600, 660)]);
  expect(comingDays(grouped, 3).map((d) => d.day)).toEqual([5, 1]);
  expect(comingDays(grouped, 5)[0].lessons[0].name).toBe("a");
});

test("rotationDays starts on today or the next day with lessons", () => {
  const grouped = byDay([L("a", 1, 600, 660), L("b", 3, 600, 660), L("c", 5, 600, 660)]);
  expect(rotationDays(grouped, 3)).toEqual([3, 5, 1]);
  expect(rotationDays(grouped, 4)).toEqual([5, 1, 3]);
  expect(rotationDays(byDay([]), 4)).toEqual([]);
});

test("DAY_NAMES runs Sunday to Saturday", () => {
  expect(DAY_NAMES).toEqual(["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]);
});

describe("stored copy", () => {
  const feed = { name: "a", layout: "week", serverTime: "2026-11-10T14:20:00Z", lessons: [L("a", 1, 600, 660)] };
  const DAY = 24 * 60 * 60 * 1000;
  const A = "A".repeat(43);
  const B = "B".repeat(43);
  beforeEach(() => localStorage.clear());

  test("round trip under its key, with the time it was saved", () => {
    saveFeed(feed, 1000, A);
    const raw = localStorage.getItem("tamheed_display_feed_v1");
    expect(raw).toBeTruthy();
    expect(raw).not.toContain(A);
    expect(loadFeed(1000 + DAY, A)).toEqual(feed);
    expect(loadStored(1000 + DAY, A)).toEqual({ feed, savedAt: 1000 });
  });
  test("older than 7 days is ignored", () => {
    saveFeed(feed, 1000, A);
    expect(loadFeed(1000 + 8 * DAY, A)).toBeNull();
  });
  test("a copy belongs to its own screen link", () => {
    saveFeed(feed, 1000, A);
    expect(loadFeed(1000, B)).toBeNull();
    clearFeed(B);
    expect(loadFeed(1000, A)).toEqual(feed);
    clearFeed(A);
    expect(loadFeed(1000, A)).toBeNull();
  });
  test("bad JSON or a throwing storage gives null and never throws", () => {
    localStorage.setItem("tamheed_display_feed_v1", "{oops");
    expect(loadFeed(1000, A)).toBeNull();
    const spy = jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const set = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const remove = jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
    try {
      expect(loadFeed(1000, A)).toBeNull();
      expect(() => saveFeed(feed, 1000, A)).not.toThrow();
      expect(() => clearFeed(A)).not.toThrow();
    } finally { spy.mockRestore(); set.mockRestore(); remove.mockRestore(); }
  });
});
