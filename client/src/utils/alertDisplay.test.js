import { createThrottle, normalizeAlert, mergeAlerts, safeLink, sortAlerts, unreadCount, alertText, mergeAlert, markReadLocal, alertTime, severityClass } from "./alertDisplay";

const a = (id, at, extra = {}) => ({ id, at, severity: "info", read: false, text: { ar: `ar${id}`, he: `he${id}`, en: `en${id}` }, ...extra });

test("sortAlerts puts newest first without changing the input", () => {
  const list = [a("1", "2026-01-01T10:00:00Z"), a("2", "2026-01-03T10:00:00Z"), a("3", "2026-01-02T10:00:00Z")];
  expect(sortAlerts(list).map((x) => x.id)).toEqual(["2", "3", "1"]);
  expect(list[0].id).toBe("1");
  expect(sortAlerts(null)).toEqual([]);
});

test("unreadCount counts only unread alerts", () => {
  expect(unreadCount([a("1", "x"), a("2", "x", { read: true }), a("3", "x")])).toBe(2);
  expect(unreadCount(undefined)).toBe(0);
});

test("alertText uses the language and falls back to Arabic", () => {
  const alert = a("1", "x");
  expect(alertText(alert, "he")).toBe("he1");
  expect(alertText(alert, "en")).toBe("en1");
  expect(alertText({ text: { ar: "فقط" } }, "en")).toBe("فقط");
  expect(alertText({ text: { ar: "فقط", en: "  " } }, "en")).toBe("فقط");
  expect(alertText({}, "en")).toBe("");
});

test("mergeAlert adds new alerts, replaces same id and keeps 50 newest", () => {
  const merged = mergeAlert([a("1", "2026-01-01T00:00:00Z")], a("2", "2026-01-02T00:00:00Z"));
  expect(merged.map((x) => x.id)).toEqual(["2", "1"]);
  expect(mergeAlert(merged, a("2", "2026-01-02T00:00:00Z", { read: true })).length).toBe(2);
  const many = Array.from({ length: 50 }, (_, i) => a(String(i), `2026-01-01T00:${String(i).padStart(2, "0")}:00Z`));
  const out = mergeAlert(many, a("new", "2026-02-01T00:00:00Z"));
  expect(out.length).toBe(50);
  expect(out[0].id).toBe("new");
  expect(mergeAlert([], null)).toEqual([]);
});

test("markReadLocal marks one alert or all", () => {
  const list = [a("1", "x"), a("2", "x")];
  expect(markReadLocal(list, "1").map((x) => x.read)).toEqual([true, false]);
  expect(markReadLocal(list).map((x) => x.read)).toEqual([true, true]);
});

test("alertTime shows Asia/Jerusalem time", () => {
  // 2026-07-01 12:00 UTC is 15:00 in Jerusalem (summer time).
  expect(alertTime("2026-07-01T12:00:00Z", "en")).toMatch(/15:00/);
  expect(alertTime("bad", "en")).toBe("");
});

test("severityClass maps severity with info as default", () => {
  expect(severityClass("critical")).toBe("critical");
  expect(severityClass("important")).toBe("important");
  expect(severityClass("weird")).toBe("info");
});

test("mergeAlerts keeps stream alerts that arrived before the fetch finished", () => {
  const live = a("live", "2026-01-05T00:00:00Z");
  const merged = mergeAlerts([live], [a("1", "2026-01-01T00:00:00Z", { read: true })]);
  expect(merged.map((x) => x.id)).toEqual(["live", "1"]);
  expect(mergeAlerts([a("1", "x", { read: true })], [a("1", "x")])[0].read).toBe(true);
  expect(mergeAlerts(undefined, undefined)).toEqual([]);
});

test("normalizeAlert maps readAt or a missing flag to a boolean read", () => {
  expect(normalizeAlert({ id: "1" }).read).toBe(false);
  expect(normalizeAlert({ id: "1", readAt: "2026-01-01" }).read).toBe(true);
  expect(normalizeAlert({ id: "1", read: true }).read).toBe(true);
});

test("safeLink allows only in-app paths", () => {
  expect(safeLink("/vehicles")).toBe("/vehicles");
  expect(safeLink("//evil.com")).toBe("");
  expect(safeLink("https://evil.com")).toBe("");
  expect(safeLink("/\\evil.com")).toBe("");
  expect(safeLink("")).toBe("");
  expect(safeLink(null)).toBe("");
});

test("createThrottle runs at most once per window", () => {
  let now = 1000;
  const throttle = createThrottle(10000, () => now);
  const fn = jest.fn();
  expect(throttle(fn)).toBe(true);
  now += 9999;
  expect(throttle(fn)).toBe(false);
  now += 1;
  expect(throttle(fn)).toBe(true);
  expect(fn).toHaveBeenCalledTimes(2);
});
