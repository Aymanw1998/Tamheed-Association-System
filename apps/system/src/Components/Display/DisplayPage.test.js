import React from "react";
import { act, allByTestId, byText, cleanup, flush, queryByText, render } from "./displayTestDom";
import DisplayPage from "./DisplayPage";
import { fetchDisplayFeed } from "../../WebServer/services/display/functionsDisplay.jsx";
import { saveFeed } from "./displayBoard";

jest.mock("../../WebServer/services/display/functionsDisplay.jsx", () => ({ fetchDisplayFeed: jest.fn() }));

// The wall display page (owner, 2026-11-12): no sign-in, keeps the last
// program through network trouble, and closes only on a revoked link.

const SECRET = "S".repeat(43);
const KEY = "tamheed_display_feed_v1";
const CLOSED = "رابط هذه الشاشة لم يعد صالحًا. اطلبوا رابطًا جديدًا من الجمعية.";
const lesson = (name, day, startMin, endMin, extra = {}) => ({ name, day, startMin, endMin, room: "1", guide: null, kind: "lesson", ...extra });
const feedOf = (extra = {}) => ({
  name: "المدخل", layout: "week", serverTime: new Date().toISOString(),
  lessons: [lesson("رياضيات", 3, 840, 900, { guide: "سامي حداد" }), lesson("كرة قدم", 4, 960, 1050, { room: "9", kind: "sport" })],
  ...extra,
});
const ok = (extra) => () => Promise.resolve({ ok: true, feed: feedOf(extra) });
const tick = async (ms) => { await act(async () => { jest.advanceTimersByTime(ms); }); };

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(Date.parse("2026-11-10T14:20:00Z")); // Tuesday 16:20 in Israel
  window.localStorage.clear();
  window.location.hash = `#${SECRET}`;
  fetchDisplayFeed.mockReset();
});
afterEach(() => { cleanup(); jest.useRealTimers(); });

test("shows the program from the link, with name, time, room and guide", async () => {
  fetchDisplayFeed.mockImplementation(ok());
  render(<DisplayPage />);
  expect((await flush(), byText("رياضيات"))).toBeTruthy();
  expect(fetchDisplayFeed).toHaveBeenCalledWith(SECRET);
  expect(byText("سامي حداد")).toBeTruthy();
  expect(allByTestId("display-guide")).toHaveLength(1);
  expect(byText("16:20")).toBeTruthy();
  expect(byText(/تمهيد · برنامج الأسبوع/)).toBeTruthy();
  expect(JSON.parse(window.localStorage.getItem(KEY)).feed.name).toBe("المدخل");
});

test("first load with no copy and no network shows the loading text, never blank", async () => {
  fetchDisplayFeed.mockResolvedValue({ ok: false });
  render(<DisplayPage />);
  await tick(0);
  expect(byText("جارٍ تحميل البرنامج…")).toBeTruthy();
});

test("a revoked link shows the closed message and wipes the stored copy", async () => {
  saveFeed(feedOf(), Date.now(), SECRET);
  fetchDisplayFeed.mockResolvedValue({ ok: false, closed: true });
  render(<DisplayPage />);
  expect((await flush(), byText(CLOSED))).toBeTruthy();
  expect(queryByText("رياضيات")).toBeNull();
  expect(window.localStorage.getItem(KEY)).toBeNull();
});

test("no secret in the link is a closed link", async () => {
  window.location.hash = "";
  fetchDisplayFeed.mockResolvedValue({ ok: false, closed: true });
  render(<DisplayPage />);
  expect((await flush(), byText(CLOSED))).toBeTruthy();
});

test.each([["500"], ["429"]])("a %s keeps the stored program and is not a closed link", async () => {
  saveFeed(feedOf(), Date.now(), SECRET);
  fetchDisplayFeed.mockResolvedValue({ ok: false });
  render(<DisplayPage />);
  expect(byText("رياضيات")).toBeTruthy();
  await tick(10000);
  expect(fetchDisplayFeed).toHaveBeenCalledTimes(2);
  expect(byText("رياضيات")).toBeTruthy();
  expect(queryByText(CLOSED)).toBeNull();
  expect(window.localStorage.getItem(KEY)).not.toBeNull();
});

test("after 5 minutes without success a stale note shows; a success removes it", async () => {
  fetchDisplayFeed.mockImplementationOnce(ok());
  fetchDisplayFeed.mockResolvedValue({ ok: false });
  render(<DisplayPage />);
  expect((await flush(), byText("رياضيات"))).toBeTruthy();
  await tick(4 * 60000);
  expect(queryByText(/آخر تحديث/)).toBeNull();
  await tick(2 * 60000);
  expect(byText("آخر تحديث 10/11/2026 16:20")).toBeTruthy();
  fetchDisplayFeed.mockImplementation(ok());
  await tick(60000);
  expect(queryByText(/آخر تحديث/)).toBeNull();
});

test("the layout follows the next fetch", async () => {
  fetchDisplayFeed.mockImplementationOnce(ok());
  fetchDisplayFeed.mockImplementation(ok({ layout: "today" }));
  render(<DisplayPage />);
  expect((await flush(), byText(/تمهيد · برنامج الأسبوع/))).toBeTruthy();
  await tick(60000);
  expect(byText(/تمهيد · برنامج اليوم/)).toBeTruthy();
});

test("an unknown layout falls back to the whole week", async () => {
  fetchDisplayFeed.mockImplementation(ok({ layout: "grid" }));
  render(<DisplayPage />);
  expect((await flush(), byText(/تمهيد · برنامج الأسبوع/))).toBeTruthy();
  expect(byText("الأحد")).toBeTruthy();
});

test("left open across midnight, the next day becomes today without a reload", async () => {
  jest.setSystemTime(Date.parse("2026-11-10T21:59:50Z")); // Tuesday 23:59:50 in Israel
  fetchDisplayFeed.mockImplementation(ok());
  render(<DisplayPage />);
  expect((await flush(), byText("رياضيات"))).toBeTruthy();
  expect((byText("الثلاثاء").closest("[data-today]")).getAttribute("data-today")).toBe("true");
  await tick(30000);
  expect((byText("الأربعاء").closest("[data-today]")).getAttribute("data-today")).toBe("true");
  expect((byText("الثلاثاء").closest("[data-today]")).getAttribute("data-today")).toBe("false");
});

test("a stored copy that crashes the board is dropped, so the next load fetches afresh", async () => {
  const spy = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    saveFeed(feedOf({ lessons: [lesson({ broken: true }, 3, 840, 900)] }), Date.now(), SECRET);
    fetchDisplayFeed.mockReturnValue(new Promise(() => {}));
    render(<DisplayPage />);
    await flush();
    expect(byText("جارٍ تحميل البرنامج…")).toBeTruthy();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  } finally { spy.mockRestore(); }
});

test("restarted with no network: an old copy shows its date at once", async () => {
  const DAY = 24 * 60 * 60 * 1000;
  saveFeed(feedOf({ serverTime: new Date(Date.now() - 3 * DAY).toISOString() }), Date.now() - 3 * DAY, SECRET);
  fetchDisplayFeed.mockResolvedValue({ ok: false });
  render(<DisplayPage />);
  await flush();
  expect(byText("رياضيات")).toBeTruthy();
  expect(byText("آخر تحديث 07/11/2026 16:20")).toBeTruthy();
});

test("restarted with no network: the server clock correction is kept", async () => {
  jest.setSystemTime(Date.parse("2026-11-10T17:20:00Z")); // the TV is 3 hours fast
  saveFeed(feedOf({ serverTime: "2026-11-10T14:20:00.000Z" }), Date.now(), SECRET);
  fetchDisplayFeed.mockResolvedValue({ ok: false });
  render(<DisplayPage />);
  await flush();
  expect(byText("16:20")).toBeTruthy();
});

test("another screen's stored copy is never shown", async () => {
  saveFeed(feedOf(), Date.now(), "O".repeat(43));
  fetchDisplayFeed.mockReturnValue(new Promise(() => {}));
  render(<DisplayPage />);
  await flush();
  expect(queryByText("رياضيات")).toBeNull();
  expect(byText("جارٍ تحميل البرنامج…")).toBeTruthy();
});

test("a TV clock 3 hours fast still shows Israel time from the server", async () => {
  const serverNow = new Date("2026-11-10T14:20:00Z").toISOString();
  jest.setSystemTime(Date.parse("2026-11-10T17:20:00Z"));
  fetchDisplayFeed.mockResolvedValue({ ok: true, feed: feedOf({ serverTime: serverNow }) });
  render(<DisplayPage />);
  expect((await flush(), byText("16:20"))).toBeTruthy();
});

test("rooms: after today's last lesson the header names tomorrow and its date", async () => {
  fetchDisplayFeed.mockImplementation(ok({ layout: "rooms" }));
  render(<DisplayPage />);
  expect((await flush(), byText(/تمهيد · برنامج الغد/))).toBeTruthy();
  expect(byText("الأربعاء 11/11/2026")).toBeTruthy();
  expect(byText("16:20")).toBeTruthy();
  expect(byText("كرة قدم")).toBeTruthy();
});

test("rooms: while today still has a lesson the header says today", async () => {
  fetchDisplayFeed.mockImplementation(ok({ layout: "rooms", lessons: [lesson("مساء", 3, 1000, 1100)] }));
  render(<DisplayPage />);
  expect((await flush(), byText(/تمهيد · برنامج اليوم/))).toBeTruthy();
  expect(byText("الثلاثاء 10/11/2026")).toBeTruthy();
});

test("a new link opened in the same tab is used at once (Codex review)", async () => {
  const NEW = "N".repeat(43);
  fetchDisplayFeed.mockImplementation((token) => Promise.resolve(token === SECRET ? { ok: false, closed: true } : { ok: true, feed: feedOf() }));
  render(<DisplayPage />);
  expect((await flush(), byText(CLOSED))).toBeTruthy();
  await act(async () => {
    window.location.hash = `#${NEW}`;
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  await flush();
  expect(fetchDisplayFeed).toHaveBeenLastCalledWith(NEW);
  expect(byText("رياضيات")).toBeTruthy();
  expect(queryByText(CLOSED)).toBeNull();
});

test("rooms: tomorrow's date is right on the night the clocks move (Codex review)", async () => {
  jest.setSystemTime(Date.parse("2026-03-26T21:30:00Z")); // Thursday 23:30 in Israel; summer time starts that night
  fetchDisplayFeed.mockImplementation(ok({ layout: "rooms", serverTime: new Date().toISOString(), lessons: [lesson("أ", 5, 600, 660), lesson("ب", 6, 600, 660)] }));
  render(<DisplayPage />);
  expect((await flush(), byText(/تمهيد · برنامج الغد/))).toBeTruthy();
  expect(byText("الجمعة 27/03/2026")).toBeTruthy();
});

test("rooms: a day further ahead across the autumn change keeps its date (Codex review)", async () => {
  jest.setSystemTime(Date.parse("2026-10-24T21:30:00Z")); // Sunday 00:30 in Israel, 25/10, winter time from 02:00
  fetchDisplayFeed.mockImplementation(ok({ layout: "rooms", serverTime: new Date().toISOString(), lessons: [lesson("ب", 2, 600, 660)] }));
  render(<DisplayPage />);
  expect((await flush(), byText(/تمهيد · برنامج الغد/))).toBeTruthy();
  expect(byText("الاثنين 26/10/2026")).toBeTruthy();
});

test("a layout change in the System shows within 10 seconds, with no reload (owner)", async () => {
  fetchDisplayFeed.mockImplementationOnce(ok());
  fetchDisplayFeed.mockImplementation(ok({ layout: "today" }));
  render(<DisplayPage />);
  expect((await flush(), byText(/تمهيد · برنامج الأسبوع/))).toBeTruthy();
  await tick(10000);
  expect(byText(/تمهيد · برنامج اليوم/)).toBeTruthy();
});

test("the top bar carries the association's logo (owner)", async () => {
  fetchDisplayFeed.mockImplementation(ok());
  render(<DisplayPage />);
  await flush();
  const logo = document.querySelector("header img");
  expect(logo).toBeTruthy();
  expect(logo.getAttribute("alt")).toBe("شعار جمعية تمهيد");
});
