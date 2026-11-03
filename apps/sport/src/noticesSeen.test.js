import { NOTICES_SEEN_KEY, markSeen, readSeen, unseenCount } from "./noticesSeen";

const n = (iso) => ({ createdAt: iso });

beforeEach(() => localStorage.clear());

test("nothing seen yet: every notice is new", () => {
  expect(readSeen("a")).toBe(0);
  expect(unseenCount([n("2026-05-01T10:00:00Z"), n("2026-05-02T10:00:00Z")], readSeen("a"))).toBe(2);
});

test("marking seen keeps the newest, and only newer notices count", () => {
  markSeen([n("2026-05-01T10:00:00Z"), n("2026-05-02T10:00:00Z")], "a");
  expect(readSeen("a")).toBe(Date.parse("2026-05-02T10:00:00Z"));
  expect(unseenCount([n("2026-05-02T10:00:00Z"), n("2026-05-03T10:00:00Z")], readSeen("a"))).toBe(1);
  markSeen([n("2026-05-01T10:00:00Z")], "a");
  expect(readSeen("a")).toBe(Date.parse("2026-05-02T10:00:00Z"));
});

test("each student on a shared phone keeps their own marks", () => {
  markSeen([n("2026-05-02T12:00:00Z")], "a");
  expect(readSeen("b")).toBe(0);
  expect(unseenCount([n("2026-05-02T11:00:00Z")], readSeen("b"))).toBe(1);
});

test("blocked or broken storage never throws", () => {
  localStorage.setItem(`${NOTICES_SEEN_KEY}:a`, "garbage");
  expect(readSeen("a")).toBe(0);
  const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  expect(() => markSeen([n("2026-05-01T10:00:00Z")], "a")).not.toThrow();
  spy.mockRestore();
});
