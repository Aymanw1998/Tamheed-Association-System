import React from "react";
import { allByTestId, allByText, byTestId, byText, cleanup, queryByText, render } from "./displayTestDom";
import WeekLayout from "./WeekLayout";

// The wall layouts as real timetables (owner, 2026-11-12): hours down the
// side and every lesson at its time, not a list; the week always runs Sunday
// to Saturday. Only the week and the rooms board remain (owner, 2026-11-14).

afterEach(cleanup);

const L = (name, day, startMin, endMin, extra = {}) => ({ name, day, startMin, endMin, room: "1", guide: null, kind: "lesson", ...extra });
const many = Array.from({ length: 14 }, (_, i) => L(`برنامج ${i + 1}`, 3, 600 + i * 30, 630 + i * 30));
const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const heads = () => allByTestId("display-room-head").map((el) => el.textContent);
const stateOf = (name) => byText(name).closest("[data-state]").getAttribute("data-state");

describe.each([
  ["week", WeekLayout],
])("%s layout", (_name, Layout) => {
  test("a day with 14 lessons shows all 14", () => {
    render(<Layout lessons={many} today={3} minute={700} />);
    for (let i = 1; i <= 14; i += 1) expect(byText(`برنامج ${i}`)).toBeTruthy();
  });

  test("lessons sit on a time grid: hours down the side, each block at its time", () => {
    render(<Layout lessons={[L("أ", 3, 600, 660), L("ب", 3, 720, 780)]} today={3} minute={0} />);
    expect(allByTestId("display-hour").map((el) => el.textContent)).toEqual(["10:00", "11:00", "12:00", "13:00"]);
    const top = (name) => parseFloat(byText(name).closest("[data-lane]").style.top);
    expect(top("أ")).toBe(0);
    expect(top("ب")).toBeCloseTo(66.67, 1);
  });

  test("time, room and guide; no guide line without a guide", () => {
    render(<Layout lessons={[
      L("رياضيات", 3, 840, 900, { guide: "سامي حداد" }),
      L("كرة قدم", 3, 960, 1050, { room: "9", kind: "sport" }),
    ]} today={3} minute={980} />);
    expect(byText("سامي حداد")).toBeTruthy();
    expect(allByTestId("display-guide")).toHaveLength(1);
    expect(allByText(/14:00–15:00/).length).toBeGreaterThan(0);
    expect(allByText(/التدريب الخارجي/).length).toBeGreaterThan(0);
  });

  test("times read left to right inside the right-to-left board", () => {
    render(<Layout lessons={[L("رياضيات", 3, 840, 900)]} today={3} minute={0} />);
    const time = allByText("14:00–15:00")[0];
    expect(time && time.closest('[dir="ltr"]')).toBeTruthy();
  });

  test("the running lesson is marked now", () => {
    render(<Layout lessons={[L("أ", 3, 840, 900), L("ب", 3, 960, 1050), L("ج", 3, 1080, 1100)]} today={3} minute={980} />);
    const running = byText("ب").closest("[data-state]");
    expect(running.getAttribute("data-state")).toBe("now");
    expect(byText("الآن", running)).toBeTruthy();
  });
});

describe("week", () => {
  test("Sunday to Saturday always, even days with no lessons; today marked", () => {
    render(<WeekLayout lessons={[L("أ", 3, 600, 660)]} today={3} minute={0} />);
    expect(heads()).toEqual(DAYS);
    const todayHead = allByTestId("display-room-head").find((h) => h.textContent === "الثلاثاء");
    expect(todayHead.getAttribute("data-today")).toBe("true");
  });

  test("each lesson in its day's column, with its room written on it", () => {
    render(<WeekLayout lessons={[L("أ", 5, 600, 660, { room: "6" }), L("ب", 1, 600, 660, { room: null })]} today={3} minute={0} />);
    expect(byText("أ").closest("[data-room]").getAttribute("data-room")).toBe("5");
    expect(byText("المصلى")).toBeTruthy();
    expect(queryByText(/بدون غرفة/)).toBeNull();
  });

  test("the red now line runs only in today's column", () => {
    render(<WeekLayout lessons={[L("أ", 3, 600, 700), L("ب", 4, 600, 700)]} today={3} minute={650} />);
    const line = byTestId("display-now-line");
    expect(line.closest("[data-room]").getAttribute("data-room")).toBe("3");
    expect(allByTestId("display-now-line")).toHaveLength(1);
  });

  test("other days carry no «الآن» or «التالي»", () => {
    render(<WeekLayout lessons={[L("أ", 3, 600, 700), L("ب", 4, 600, 700)]} today={3} minute={650} />);
    expect(stateOf("ب")).toBe("day");
  });
});

test("week: today's column is twice as wide (owner, 2026-11-12: a busy day stays readable)", () => {
  render(<WeekLayout lessons={[L("أ", 3, 600, 660)]} today={3} minute={0} />);
  const template = document.querySelector("[data-testid=display-room-track]").parentElement.parentElement.firstChild.style.gridTemplateColumns;
  expect(template).toBe("var(--axis) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)");
});

test("week: a short lesson keeps its room beside its name (Codex review)", () => {
  render(<WeekLayout lessons={[L("قصير", 2, 600, 630, { room: "6" }), L("آخر", 2, 1260, 1320)]} today={3} minute={0} />);
  const block = byText("قصير").closest("[data-size]");
  expect(block.getAttribute("data-size")).toBe("xxs");
  expect(block.querySelector("[data-room-inline]").textContent).toContain("المصلى");
});
