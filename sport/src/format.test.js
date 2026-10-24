import { describe, it, expect } from "vitest";
import { formatTrainingDate, attendanceLabel, statCells, cardSubtitle } from "./format.js";

// Local-time dates so the test does not depend on the machine's time zone.
const now = new Date(2026, 9, 24, 10, 0); // Saturday 24 Oct 2026

describe("formatTrainingDate", () => {
  it("says today with the time", () => {
    expect(formatTrainingDate(new Date(2026, 9, 24, 17, 0).toISOString(), now)).toBe("اليوم 17:00");
  });
  it("says tomorrow with the time", () => {
    expect(formatTrainingDate(new Date(2026, 9, 25, 9, 5).toISOString(), now)).toBe("غدًا 09:05");
  });
  it("uses the weekday, day/month and time for later dates", () => {
    const out = formatTrainingDate(new Date(2026, 10, 2, 17, 0).toISOString(), now);
    expect(out).toMatch(/^\S+ 2\/11 · 17:00$/);
    expect(out).toContain("الاثنين");
  });
});

describe("attendanceLabel", () => {
  it("shows a dash for null", () => {
    expect(attendanceLabel(null)).toBe("—");
  });
  it("shows a percent", () => {
    expect(attendanceLabel(92)).toBe("92%");
    expect(attendanceLabel(0)).toBe("0%");
  });
});

describe("statCells", () => {
  const sport = { stats: [{ key: "a", label: "أهداف" }, { key: "b", label: "تمريرات" }] };
  it("holds matches, attendance, then the sport stats in order, never age", () => {
    const cells = statCells({ sport, stats: { matches: 0, attendance: null, values: { a: 0, b: 0 } } });
    expect(cells.map((c) => c.label)).toEqual(["مباريات", "الحضور", "أهداف", "تمريرات"]);
    expect(cells[1].value).toBe("—");
  });
  it("caps the sport stats at four", () => {
    const stats = ["a", "b", "c", "d", "e"].map((key) => ({ key, label: key }));
    expect(statCells({ sport: { stats }, stats: { values: {} } })).toHaveLength(6);
  });
});

describe("cardSubtitle", () => {
  it("joins age and position", () => expect(cardSubtitle(11, "مهاجم")).toBe("11 سنة · مهاجم"));
  it("shows the position alone without age", () => expect(cardSubtitle(null, "مهاجم")).toBe("مهاجم"));
  it("shows the age alone without a position", () => expect(cardSubtitle(11, "")).toBe("11 سنة"));
  it("shows nothing when both are empty", () => expect(cardSubtitle(null, "")).toBe(""));
});
