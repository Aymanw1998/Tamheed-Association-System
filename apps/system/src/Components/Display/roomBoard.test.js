import { boardDay, boardTitle, hourRange, lanes, roomColumns, viewWindow } from "./roomBoard";

// The rooms board (owner, 2026-11-12): rooms are columns, hours run down the
// side, and after the day's last lesson the board shows the next day.

const L = (name, day, startMin, endMin, room = "1") => ({ name, day, startMin, endMin, room, guide: null, kind: "lesson" });

describe("boardDay", () => {
  const week = [L("a", 3, 600, 660), L("b", 3, 900, 1000), L("c", 4, 540, 600), L("d", 6, 600, 700)];

  test("today while a lesson of today has not ended", () => {
    expect(boardDay(week, 3, 990)).toMatchObject({ day: 3, ahead: 0 });
    expect(boardDay(week, 3, 0).lessons).toHaveLength(2);
  });

  test("tomorrow once today's last lesson has ended", () => {
    expect(boardDay(week, 3, 1000)).toMatchObject({ day: 4, ahead: 1 });
  });

  test("skips a day with no lessons", () => {
    expect(boardDay(week, 4, 700)).toMatchObject({ day: 6, ahead: 2 });
    expect(boardDay(week, 5, 0)).toMatchObject({ day: 6, ahead: 1 });
  });

  test("a day with no lessons at all shows the next day that has some", () => {
    expect(boardDay(week, 1, 0)).toMatchObject({ day: 3, ahead: 2 });
  });

  test("wraps around the week", () => {
    expect(boardDay(week, 6, 800)).toMatchObject({ day: 3, ahead: 4 });
  });

  test("only today has lessons and they ended: the same day next week", () => {
    expect(boardDay([L("a", 2, 600, 660)], 2, 700)).toMatchObject({ day: 2, ahead: 7 });
  });

  test("no lessons at all: null", () => {
    expect(boardDay([], 3, 600)).toBeNull();
    expect(boardDay(null, 3, 600)).toBeNull();
  });
});

describe("boardTitle", () => {
  test("today, tomorrow, or the day's name", () => {
    expect(boardTitle({ day: 3, ahead: 0 })).toBe("برنامج اليوم");
    expect(boardTitle({ day: 4, ahead: 1 })).toBe("برنامج الغد");
    expect(boardTitle({ day: 6, ahead: 2 })).toBe("برنامج يوم الجمعة");
    expect(boardTitle({ day: 2, ahead: 7 })).toBe("برنامج يوم الاثنين");
  });
});

describe("roomColumns", () => {
  test("every room in order, even with no lessons (owner), then text rooms, then «بدون غرفة»", () => {
    const cols = roomColumns([
      L("a", 1, 600, 660, "9"), L("b", 1, 600, 660, null), L("c", 1, 600, 660, "2"),
      L("d", 1, 600, 660, "مختبر"), L("e", 1, 600, 660, "6"), L("f", 1, 700, 760, "2"), L("g", 1, 600, 660, "0"),
    ]);
    expect(cols.map((c) => c.label)).toEqual(["غرفة 1", "غرفة 2", "غرفة 3", "غرفة 4", "غرفة 5", "المصلى", "مقر قديم", "الساحة", "التدريب الخارجي", "مختبر", "بدون غرفة"]);
    expect(cols[1].lessons.map((l) => l.name)).toEqual(["c", "f"]);
    expect(cols[0].lessons).toEqual([]);
    expect(cols[10].lessons.map((l) => l.name)).toEqual(["b", "g"]);
  });

  test("a room stored as \"02\" is the same column as \"2\"", () => {
    expect(roomColumns([L("a", 1, 600, 660, "2"), L("b", 1, 700, 760, "02")])[1].lessons).toHaveLength(2);
  });

  test("«بدون غرفة» and text rooms appear only when a lesson uses them", () => {
    expect(roomColumns([]).map((c) => c.label)).toEqual(["غرفة 1", "غرفة 2", "غرفة 3", "غرفة 4", "غرفة 5", "المصلى", "مقر قديم", "الساحة", "التدريب الخارجي"]);
  });
});

describe("hourRange", () => {
  test("from the first start rounded down to the half hour, to the last end", () => {
    expect(hourRange([L("a", 1, 615, 700), L("b", 1, 560, 600), L("c", 1, 900, 1010)])).toEqual({ from: 540, to: 1010 });
    expect(hourRange([L("a", 1, 600, 660)])).toEqual({ from: 600, to: 660 });
  });
});

describe("viewWindow", () => {
  const short = { from: 900, to: 1200 }; // 5 hours
  const long = { from: 540, to: 1260 }; // 12 hours

  test("a day of 5 hours or less fits whole", () => {
    expect(viewWindow(short, 1000, true)).toEqual(short);
  });

  test("a longer day today: 4 hours, 1 back and 3 ahead", () => {
    expect(viewWindow(long, 800, true)).toEqual({ from: 740, to: 980 });
  });

  test("the window stops at the first and last hour", () => {
    expect(viewWindow(long, 500, true)).toEqual({ from: 540, to: 780 });
    expect(viewWindow(long, 1250, true)).toEqual({ from: 1020, to: 1260 });
  });

  test("a coming day shows its whole span, however long", () => {
    expect(viewWindow(long, 800, false)).toEqual(long);
  });
});

describe("lanes", () => {
  test("lessons that do not overlap take the full width", () => {
    const out = lanes([L("a", 1, 600, 660), L("b", 1, 660, 720)]);
    expect(out.map((l) => [l.lane, l.laneCount])).toEqual([[0, 1], [0, 1]]);
  });

  test("two lessons at the same time stand side by side", () => {
    const out = lanes([L("a", 1, 600, 700), L("b", 1, 630, 690), L("c", 1, 720, 780)]);
    expect(out.map((l) => [l.name, l.lane, l.laneCount])).toEqual([["a", 0, 2], ["b", 1, 2], ["c", 0, 1]]);
  });

  test("a lane frees up when its lesson ends", () => {
    const out = lanes([L("a", 1, 600, 700), L("b", 1, 610, 650), L("c", 1, 660, 690)]);
    expect(out.map((l) => [l.name, l.lane, l.laneCount])).toEqual([["a", 0, 2], ["b", 1, 2], ["c", 1, 2]]);
  });
});

describe("lanes with a minimum height (Codex review: short lessons were cut off)", () => {
  test("a short lesson drawn taller stands beside the lesson its block now reaches", () => {
    const out = lanes([L("a", 1, 600, 615), L("b", 1, 615, 675), L("c", 1, 700, 760)], 30);
    expect(out.map((l) => [l.name, l.lane, l.laneCount])).toEqual([["a", 0, 2], ["b", 1, 2], ["c", 0, 1]]);
  });

  test("without a minimum, touching lessons share one lane", () => {
    const out = lanes([L("a", 1, 600, 615), L("b", 1, 615, 675)]);
    expect(out.map((l) => l.laneCount)).toEqual([1, 1]);
  });
});
