import { attendanceDateAllowed, hhmmToMin, lessonDates, lessonLabel, mergeSchedule } from "./sportSchedule";

describe("mergeSchedule", () => {
  const regular = [{ _id: "r1", name: "درس", teacher: "t1", date: { day: 2, startMin: 600, endMin: 645 } }];
  const sport = [{ _id: "s1", name: "كرة القدم", teacher: null, room: "9", kind: "sport", date: { day: 1, startMin: 960, endMin: 1020 } }];

  test("keeps regular lessons untouched and marks sport ones read-only", () => {
    const merged = mergeSchedule(regular, sport);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(regular[0]);
    expect(merged[0].readOnly).toBeUndefined();
    expect(merged[1]).toMatchObject({ _id: "s1", readOnly: true, room: "9" });
    expect(sport[0].readOnly).toBeUndefined();
  });

  test("copes with missing lists", () => {
    expect(mergeSchedule(undefined, undefined)).toEqual([]);
    expect(mergeSchedule(regular, null)).toEqual(regular);
  });
});

describe("attendanceDateAllowed", () => {
  const today = "2026-10-28";

  test("allows a past date on the lesson's weekday", () => {
    expect(attendanceDateAllowed("2026-10-25", 1, today)).toBe(true);
  });
  test("allows today when it is the lesson's weekday", () => {
    expect(attendanceDateAllowed("2026-10-28", 4, today)).toBe(true);
  });
  test("rejects another weekday", () => {
    expect(attendanceDateAllowed("2026-10-26", 1, today)).toBe(false);
  });
  test("rejects a future date", () => {
    expect(attendanceDateAllowed("2026-11-01", 1, today)).toBe(false);
  });
  test("rejects malformed and impossible dates", () => {
    expect(attendanceDateAllowed("25/10/2026", 1, today)).toBe(false);
    expect(attendanceDateAllowed("2026-02-30", 1, today)).toBe(false);
    expect(attendanceDateAllowed("", 1, today)).toBe(false);
  });
});

describe("lessonDates", () => {
  test("lists the lesson's weekday dates from the latest, never after today", () => {
    expect(lessonDates(1, "2026-10-28", 3)).toEqual(["2026-10-25", "2026-10-18", "2026-10-11"]);
  });
  test("starts with today when today is the lesson's weekday", () => {
    expect(lessonDates(4, "2026-10-28", 2)).toEqual(["2026-10-28", "2026-10-21"]);
  });
});

test("hhmmToMin turns a time field into minutes from midnight", () => {
  expect(hhmmToMin("16:30")).toBe(990);
  expect(hhmmToMin("00:00")).toBe(0);
  expect(hhmmToMin("")).toBeNaN();
});

test("a read-only sport lesson gets a football before its name", () => {
  expect(lessonLabel({ name: "ناشئين", readOnly: true })).toBe("⚽ ناشئين");
  expect(lessonLabel({ name: "رياضيات" })).toBe("رياضيات");
});
