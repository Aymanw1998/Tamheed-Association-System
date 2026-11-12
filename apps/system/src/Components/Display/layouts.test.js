import React from "react";
import { act, allByTestId, allByText, byTestId, byText, cleanup, queryByText, render } from "./displayTestDom";
import WeekLayout from "./WeekLayout";
import TodayLayout from "./TodayLayout";
import RotateLayout from "./RotateLayout";
import { fitBoard } from "./displayParts";

// The three wall layouts (owner, 2026-11-12): every lesson of a day is on
// screen, however many there are; the guide line shows only when known.

afterEach(cleanup);

const L = (name, day, startMin, endMin, extra = {}) => ({ name, day, startMin, endMin, room: "1", guide: null, kind: "lesson", ...extra });
const many = Array.from({ length: 14 }, (_, i) => L(`برنامج ${i + 1}`, 3, 600 + i * 30, 630 + i * 30));

describe.each([
  ["week", WeekLayout],
  ["today", TodayLayout],
  ["rotate", RotateLayout],
])("%s layout", (_name, Layout) => {
  test("a day with 14 lessons shows all 14", () => {
    render(<Layout lessons={many} today={3} minute={700} />);
    for (let i = 1; i <= 14; i += 1) expect(byText(`برنامج ${i}`)).toBeTruthy();
  });

  test("time, room label and guide; no guide line without a guide", () => {
    render(<Layout lessons={[
      L("رياضيات", 3, 840, 900, { guide: "سامي حداد" }),
      L("كرة قدم", 3, 960, 1050, { room: "9", kind: "sport" }),
      L("بلا غرفة", 3, 1080, 1100, { room: null }),
    ]} today={3} minute={980} />);
    expect(byText("سامي حداد")).toBeTruthy();
    expect(allByTestId("display-guide")).toHaveLength(1);
    expect(allByText(/14:00–15:00/).length).toBeGreaterThan(0);
    expect(allByText(/التدريب الخارجي/).length).toBeGreaterThan(0);
    expect(queryByText(/بدون غرفة/)).toBeNull();
  });

  test("times read left to right inside the right-to-left board", () => {
    render(<Layout lessons={[L("رياضيات", 3, 840, 900)]} today={3} minute={0} />);
    const time = allByText("14:00–15:00")[0];
    expect(time && time.closest('[dir="ltr"]')).toBeTruthy();
  });

  test("the running lesson is marked now", () => {
    render(<Layout lessons={[L("أ", 3, 840, 900), L("ب", 3, 960, 1050), L("ج", 3, 1080, 1100)]} today={3} minute={980} />);
    const running = byText("ب").closest("[data-state]");
    expect((running).getAttribute("data-state")).toBe("now");
    expect(byText("الآن", running)).toBeTruthy();
  });
});

test("week: Sunday to Thursday, Saturday only when it has lessons, today outlined", () => {
  const { rerender } = render(<WeekLayout lessons={[L("أ", 3, 600, 660)]} today={3} minute={0} />);
  expect(queryByText("السبت")).toBeNull();
  expect(byText("الخميس")).toBeTruthy();
  expect((byText("الثلاثاء").closest("[data-today]")).getAttribute("data-today")).toBe("true");
  rerender(<WeekLayout lessons={[L("أ", 3, 600, 660), L("س", 7, 600, 660)]} today={3} minute={0} />);
  expect(byText("السبت")).toBeTruthy();
});

test("today: finished dimmed, next marked, coming days on the side", () => {
  render(<TodayLayout lessons={[L("أ", 3, 840, 900), L("ب", 3, 1000, 1050), L("ج", 4, 600, 660), L("د", 1, 700, 760)]} today={3} minute={950} />);
  expect((byText("أ").closest("[data-state]")).getAttribute("data-state")).toBe("past");
  const next = byText("ب").closest("[data-state]");
  expect((next).getAttribute("data-state")).toBe("next");
  expect(byText("التالي", next)).toBeTruthy();
  const side = byTestId("display-coming");
  expect(allByTestId("display-coming-day", side).map((el) => el.textContent)).toEqual([
    expect.stringContaining("الأربعاء"), expect.stringContaining("الأحد"),
  ]);
  expect(byText(/ج 10:00/, side)).toBeTruthy();
});

test("today: a day with no lessons says so and keeps the side column", () => {
  render(<TodayLayout lessons={[L("ج", 4, 600, 660)]} today={3} minute={950} />);
  expect(byText("لا برامج اليوم")).toBeTruthy();
  expect(byTestId("display-coming")).toBeTruthy();
});

describe("rotate", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("starts on today and moves to the next day after 15 seconds, then wraps", () => {
    render(<RotateLayout lessons={[L("أ", 3, 600, 660), L("ب", 5, 600, 660)]} today={3} minute={0} />);
    expect(byTestId("display-rotate-day").textContent).toContain("الثلاثاء");
    expect(byText("أ")).toBeTruthy();
    expect(queryByText("ب")).toBeNull();
    act(() => { jest.advanceTimersByTime(15000); });
    expect(byTestId("display-rotate-day").textContent).toContain("الخميس");
    expect(byText("ب")).toBeTruthy();
    act(() => { jest.advanceTimersByTime(15000); });
    expect(byTestId("display-rotate-day").textContent).toContain("الثلاثاء");
  });

  test("an empty week says so", () => {
    render(<RotateLayout lessons={[]} today={3} minute={0} />);
    expect(byText("لا برامج هذا الأسبوع")).toBeTruthy();
  });
});

describe("fitting a crowded board", () => {
  // jsdom has no layout: each box reports a content height that shrinks
  // with the --fit scale set on the root.
  const boxOf = (root, height, room) => {
    const box = document.createElement("div");
    box.setAttribute("data-fit", "");
    Object.defineProperty(box, "clientHeight", { get: () => room });
    Object.defineProperty(box, "scrollHeight", { get: () => height * Number(root.style.getPropertyValue("--fit") || 1) });
    root.appendChild(box);
    return box;
  };

  test("shrinks until every box fits", () => {
    const root = document.createElement("div");
    boxOf(root, 1339, 933);
    boxOf(root, 300, 933);
    const scale = fitBoard(root);
    expect(scale).toBeLessThanOrEqual(933 / 1339);
    expect(scale).toBeGreaterThan(0.6);
    expect(root.style.getPropertyValue("--fit")).toBe(String(scale));
  });

  test("a board that fits keeps full size", () => {
    const root = document.createElement("div");
    boxOf(root, 500, 933);
    expect(fitBoard(root)).toBe(1);
  });

  test("a box with its own scope shrinks alone", () => {
    const root = document.createElement("div");
    boxOf(root, 500, 933);
    const side = document.createElement("div");
    side.setAttribute("data-fit", "");
    side.setAttribute("data-fit-scope", "");
    Object.defineProperty(side, "clientHeight", { get: () => 900 });
    Object.defineProperty(side, "scrollHeight", { get: () => 1400 * Number(side.style.getPropertyValue("--fit") || 1) });
    root.appendChild(side);
    expect(fitBoard(root)).toBe(1);
    expect(Number(side.style.getPropertyValue("--fit"))).toBeLessThanOrEqual(900 / 1400);
  });

  test("still too full at the floor: the lessons past the bottom hide behind «+N»", () => {
    const root = document.createElement("div");
    const box = boxOf(root, 10000, 500);
    box.getBoundingClientRect = () => ({ top: 0, bottom: 500 });
    for (let i = 0; i < 10; i += 1) {
      const item = document.createElement("div");
      item.getBoundingClientRect = () => ({ top: i * 100, bottom: (i + 1) * 100 });
      box.appendChild(item);
    }
    fitBoard(root);
    const cut = [...box.children].map((item) => item.getAttribute("data-cut") === "true");
    expect(cut).toEqual([false, false, false, false, true, true, true, true, true, true]);
    expect(box.getAttribute("data-more")).toBe("+6");
  });

  test("a later fit that fits shows everything again", () => {
    const root = document.createElement("div");
    let height = 10000;
    const box = document.createElement("div");
    box.setAttribute("data-fit", "");
    Object.defineProperty(box, "clientHeight", { get: () => 500 });
    Object.defineProperty(box, "scrollHeight", { get: () => height });
    box.getBoundingClientRect = () => ({ top: 0, bottom: 500 });
    const item = document.createElement("div");
    item.getBoundingClientRect = () => ({ top: 450, bottom: 600 });
    box.appendChild(item);
    root.appendChild(box);
    fitBoard(root);
    expect(item.getAttribute("data-cut")).toBe("true");
    height = 300;
    fitBoard(root);
    expect(item.hasAttribute("data-cut")).toBe(false);
    expect(box.hasAttribute("data-more")).toBe(false);
  });

  test("never shrinks below the floor", () => {
    const root = document.createElement("div");
    boxOf(root, 10000, 100);
    expect(fitBoard(root)).toBeCloseTo(0.4, 5);
  });
});
