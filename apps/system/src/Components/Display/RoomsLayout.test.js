import React from "react";
import { allByTestId, allByText, byTestId, byText, cleanup, queryByText, render } from "./displayTestDom";
import RoomsLayout from "./RoomsLayout";

// D. The rooms board (owner, 2026-11-12): rooms are columns, hours run down
// the side, and after the last lesson it shows the next day.

afterEach(cleanup);

const L = (name, day, startMin, endMin, room = "1", guide = null) => ({ name, day, startMin, endMin, room, guide, kind: "lesson" });
const heads = () => allByTestId("display-room-head").map((el) => el.textContent);

test("a column for every room, even an empty one (owner), «بدون غرفة» last", () => {
  render(<RoomsLayout lessons={[L("أ", 3, 600, 660, "6"), L("ب", 3, 600, 660, null), L("ج", 3, 700, 760, "2"), L("غد", 4, 600, 660, "5")]} today={3} minute={610} />);
  expect(heads()).toEqual(["غرفة 1", "غرفة 2", "غرفة 3", "غرفة 4", "غرفة 5", "المصلى", "مقر قديم", "الساحة", "التدريب الخارجي", "بدون غرفة"]);
  expect(queryByText("غد")).toBeNull();
});

test("each lesson shows name, time left to right and guide, in its room's column", () => {
  render(<RoomsLayout lessons={[L("رياضيات", 3, 840, 900, "2", "سامي حداد"), L("علوم", 3, 900, 960, "3")]} today={3} minute={800} />);
  const block = byText("رياضيات").closest("[data-testid=\"display-room-lesson\"]");
  expect(byText("سامي حداد", block)).toBeTruthy();
  expect(byText("14:00–15:00", block).closest('[dir="ltr"]')).toBeTruthy();
  expect(block.closest("[data-room]").getAttribute("data-room")).toBe("n2");
  expect(allByTestId("display-guide")).toHaveLength(1);
});

test("today: ended dimmed, running «الآن», next «التالي», and the now line", () => {
  render(<RoomsLayout lessons={[L("أ", 3, 600, 660), L("ب", 3, 650, 720, "2"), L("ج", 3, 750, 800, "3"), L("د", 3, 750, 790), L("هـ", 3, 850, 900)]} today={3} minute={690} />);
  const state = (name) => byText(name).closest("[data-state]").getAttribute("data-state");
  expect([state("أ"), state("ب"), state("ج"), state("د"), state("هـ")]).toEqual(["past", "now", "next", "next", "later"]);
  expect(allByText("الآن")).toHaveLength(1);
  expect(allByText("التالي")).toHaveLength(2);
  expect(byTestId("display-now-line")).toBeTruthy();
});

test("after the last lesson: tomorrow, no now line, no «الآن», first lessons «التالي»", () => {
  render(<RoomsLayout lessons={[L("اليوم", 3, 600, 660), L("صباح", 4, 540, 600), L("صباح2", 4, 540, 590, "2"), L("ظهر", 4, 720, 780)]} today={3} minute={700} />);
  expect(queryByText("اليوم")).toBeNull();
  expect(queryByText("الآن")).toBeNull();
  expect(allByTestId("display-now-line")).toHaveLength(0);
  const state = (name) => byText(name).closest("[data-state]").getAttribute("data-state");
  expect([state("صباح"), state("صباح2"), state("ظهر")]).toEqual(["next", "next", "later"]);
});

test("two lessons in one room at once stand side by side", () => {
  render(<RoomsLayout lessons={[L("أ", 3, 600, 700), L("ب", 3, 630, 690)]} today={3} minute={0} />);
  const a = byText("أ").closest("[data-lane]");
  const b = byText("ب").closest("[data-lane]");
  expect([a.getAttribute("data-lane"), b.getAttribute("data-lane")]).toEqual(["0/2", "1/2"]);
});

test("hours run down the side from the first half hour to the last end", () => {
  render(<RoomsLayout lessons={[L("أ", 3, 615, 700), L("ب", 3, 760, 800)]} today={3} minute={0} />);
  expect(allByTestId("display-hour").map((el) => el.textContent)).toEqual(["10:00", "11:00", "12:00", "13:00"]);
});

test("a long day today moves the board with the clock", () => {
  const day = [L("أ", 3, 540, 600), L("ب", 3, 1200, 1260)];
  const { rerender } = render(<RoomsLayout lessons={day} today={3} minute={800} />);
  const shift = () => byTestId("display-room-track").getAttribute("data-from");
  expect(shift()).toBe("740");
  rerender(<RoomsLayout lessons={day} today={3} minute={900} />);
  expect(shift()).toBe("840");
});

test("no lessons at all", () => {
  render(<RoomsLayout lessons={[]} today={3} minute={0} />);
  expect(byText("لا برامج")).toBeTruthy();
});

test("a 15-minute lesson on a long coming day keeps a readable block (Codex review)", () => {
  render(<RoomsLayout lessons={[L("قصير", 4, 780, 795), L("طويل", 4, 795, 1320)]} today={3} minute={1300} />);
  const slot = byText("قصير").closest("[data-lane]");
  expect(parseFloat(slot.style.height)).toBeGreaterThanOrEqual(4.5);
  expect(slot.getAttribute("data-lane")).toBe("0/2");
  expect(byText("طويل").closest("[data-lane]").getAttribute("data-lane")).toBe("1/2");
});

test("a short last lesson of the day is not cut off at the bottom (Codex review)", () => {
  render(<RoomsLayout lessons={[L("أول", 4, 480, 540), L("أخير", 4, 1305, 1320)]} today={3} minute={1300} />);
  const slot = byText("أخير").closest("[data-lane]");
  expect(parseFloat(slot.style.top) + parseFloat(slot.style.height)).toBeLessThanOrEqual(100.01);
  expect(parseFloat(slot.style.height)).toBeGreaterThanOrEqual(4.2);
});

test("a room with no lesson that day is shown, marked empty (owner)", () => {
  render(<RoomsLayout lessons={[L("أ", 3, 600, 660, "2")]} today={3} minute={0} />);
  const empty = allByTestId("display-room-head").filter((h) => h.getAttribute("data-empty") === "true").map((h) => h.textContent);
  expect(empty).toHaveLength(8);
  expect(empty).not.toContain("غرفة 2");
});

test("two lessons at once in one room of nine get the compact look, so names fit (Codex review)", () => {
  render(<RoomsLayout lessons={[L("أ", 3, 600, 700), L("ب", 3, 630, 690), L("ج", 3, 600, 700, "2")]} today={3} minute={0} />);
  const narrow = (name) => byText(name).closest("[data-narrow]").getAttribute("data-narrow");
  expect([narrow("أ"), narrow("ب"), narrow("ج")]).toEqual(["true", "true", "false"]);
});
