import {
  lessonTime,
  historyLabel,
  cardCells,
  nextLessonLabel,
  attendanceLabel,
  lessonDays,
  birthDateLabel,
} from "./format.js";

// Local-time dates so the test does not depend on the machine's time zone.
const now = new Date(2026, 9, 24, 10, 0); // Saturday 24 Oct 2026 (day 7)

describe("lessonTime", () => {
  it("shows the day and the time range", () => {
    expect(lessonTime({ day: 1, startMin: 1020, endMin: 1110 })).toBe("الأحد 17:00–18:30");
  });
  it("pads single-digit hours and minutes", () => {
    expect(lessonTime({ day: 4, startMin: 545, endMin: 605 })).toBe("الأربعاء 09:05–10:05");
  });
});

describe("historyLabel", () => {
  it("shows the weekday, day/month and status", () => {
    expect(historyLabel({ date: "2026-10-25", status: "حاضر" })).toBe("الأحد 25/10 · حاضر");
  });
  it("works for a Saturday", () => {
    expect(historyLabel({ date: "2026-10-31", status: "غائب" })).toBe("السبت 31/10 · غائب");
  });
});

describe("cardCells", () => {
  const statDefs = [
    { key: "a", label: "أهداف" },
    { key: "b", label: "تمريرات حاسمة" },
    { key: "c", label: "تسديدات" },
    { key: "d", label: "تصديات" },
  ];
  const card = {
    statDefs,
    values: { a: 7, b: 3, c: 0 },
    attendance: { rate: 92, present: 10, absent: 1, late: 2 },
  };
  it("holds attendance, lateness, then the stats in order: 6 cells", () => {
    const cells = cardCells(card);
    expect(cells).toHaveLength(6);
    expect(cells[0]).toEqual({ label: "الحضور", value: "92%" });
    expect(cells[1]).toEqual({ label: "التأخير", value: "2" });
    expect(cells.slice(2).map((c) => c.label)).toEqual(["أهداف", "تمريرات حاسمة", "تسديدات", "تصديات"]);
    expect(cells.slice(2).map((c) => c.value)).toEqual(["7", "3", "0", "0"]);
  });
  it("shows a dash when there is no rate yet", () => {
    const cells = cardCells({ ...card, attendance: { rate: null, present: 0, absent: 0, late: 0 } });
    expect(cells[0].value).toBe("—");
    expect(cells[1].value).toBe("0");
  });
  it("never returns more than 6 cells", () => {
    const many = ["a", "b", "c", "d", "e"].map((key) => ({ key, label: key }));
    expect(cardCells({ statDefs: many, values: {}, attendance: null })).toHaveLength(6);
  });
});

describe("nextLessonLabel", () => {
  it("says today with the time", () => {
    expect(nextLessonLabel({ day: 7, startMin: 1020 }, now)).toBe("اليوم 17:00");
  });
  it("says tomorrow with the time", () => {
    expect(nextLessonLabel({ day: 1, startMin: 1020 }, now)).toBe("غدًا 17:00");
  });
  it("uses the weekday for later days", () => {
    expect(nextLessonLabel({ day: 4, startMin: 1020 }, now)).toBe("الأربعاء 17:00");
  });
  it("uses the weekday when today's lesson time has passed (next week)", () => {
    expect(nextLessonLabel({ day: 7, startMin: 540 }, now)).toBe("السبت 09:00");
  });
});

describe("attendanceLabel", () => {
  it("shows a dash for null", () => expect(attendanceLabel(null)).toBe("—"));
  it("shows a percent", () => {
    expect(attendanceLabel(92)).toBe("92%");
    expect(attendanceLabel(0)).toBe("0%");
  });
});

describe("lessonDays", () => {
  it("lists each day once, in week order, joined by an Arabic comma", () => {
    const lessons = [
      { day: 4, startMin: 1020 },
      { day: 1, startMin: 1020 },
      { day: 1, startMin: 600 },
    ];
    expect(lessonDays(lessons)).toBe("الأحد، الأربعاء");
  });
  it("shows a dash with no lessons", () => expect(lessonDays([])).toBe("—"));
});

describe("birthDateLabel", () => {
  it("formats DD/MM/YYYY", () => expect(birthDateLabel("2015-05-10")).toBe("10/05/2015"));
  it("shows a dash when missing", () => expect(birthDateLabel(null)).toBe("—"));
});
