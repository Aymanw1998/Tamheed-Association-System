import { PDF_ROWS_PER_SECTION, guidePdfSections, newEntryIds, pickLang, readLang, readSeen, searchGuide, seenAfter, visibleGuide, writeLang, writeSeen } from "./guideLogic";

const entry = (id, path, steps, updated = "2026-10-29") => ({
  id,
  path,
  chapterId: null,
  updated,
  title: { ar: `عنوان ${id}`, he: `כותרת ${id}` },
  summary: { ar: "ملخص", he: "תקציר" },
  steps: steps.map(([requires, ar, he]) => ({ requires, text: { ar, he } })),
});

const guide = [
  entry("dashboard", "/dashboard", [[null, "أرقام", "מספרים"], ["users.approve", "قبول", "אישור"]]),
  entry("users", "/users", [[null, "قائمة", "רשימה"]]),
  entry("lessons", "/lessons", [["lessons.create", "درس جديد", "שיעור חדש"]]),
];

afterEach(() => localStorage.clear());

test("shows only screens the user can open, and only the steps they can do", () => {
  const shown = visibleGuide(["users.approve"], guide);
  expect(shown.map((e) => e.id)).toEqual(["dashboard"]);
  expect(shown[0].steps.map((s) => s.text.ar)).toEqual(["أرقام", "قبول"]);
  expect(visibleGuide([], guide).map((e) => e.id)).toEqual(["dashboard"]);
  expect(visibleGuide([], guide)[0].steps).toHaveLength(1);
  expect(visibleGuide(["users.view", "lessons.create"], guide).map((e) => e.id)).toEqual(["dashboard", "users", "lessons"]);
});

test("never changes the content it is given", () => {
  visibleGuide([], guide);
  expect(guide[0].steps).toHaveLength(2);
});

test("searches in the chosen language, every word", () => {
  expect(searchGuide(guide, "שיעור", "he").map((e) => e.id)).toEqual(["lessons"]);
  expect(searchGuide(guide, "שיעור", "ar")).toEqual([]);
  expect(searchGuide(guide, "درس جديد", "ar").map((e) => e.id)).toEqual(["lessons"]);
  expect(searchGuide(guide, "درس قائمة", "ar")).toEqual([]);
  expect(searchGuide(guide, "  ", "ar")).toBe(guide);
});

test("marks entries changed or added since the last visit, none on the first visit", () => {
  const list = [entry("a", "/dashboard", [[null, "x", "x"]], "2026-10-20"), entry("b", "/dashboard", [[null, "x", "x"]], "2026-10-29")];
  expect(newEntryIds(list, null)).toEqual([]);
  expect(newEntryIds(list, { a: "2026-10-20", b: "2026-10-25" })).toEqual(["b"]);
  expect(newEntryIds(list, { a: "2026-10-20", b: "2026-10-29" })).toEqual([]);
  // Seen this morning, changed the same day: still new.
  const sameDay = { a: "2026-10-20", b: "2026-10-29" };
  expect(newEntryIds([list[0], { ...list[1], updated: "2026-10-29b" }], sameDay)).toEqual(["b"]);
  // A screen the user did not have before.
  expect(newEntryIds(list, { a: "2026-10-20" })).toEqual(["b"]);
});

test("a visit keeps what earlier visits saw of entries not shown now", () => {
  const list = [entry("a", "/dashboard", [[null, "x", "x"]], "2026-10-29")];
  expect(seenAfter(list, { a: "2026-10-01", gone: "2026-10-02" })).toEqual({ a: "2026-10-29", gone: "2026-10-02" });
  expect(seenAfter(list, null)).toEqual({ a: "2026-10-29" });
});

test("language and last visit are remembered per device, per user", () => {
  expect(readLang()).toBe("ar");
  writeLang("he");
  expect(readLang()).toBe("he");
  expect(pickLang("en")).toBe("ar");
  writeSeen("u1", { a: "2026-10-29" });
  expect(readSeen("u1")).toEqual({ a: "2026-10-29" });
  expect(readSeen("u2")).toBeNull();
  localStorage.setItem("guide.seen.u3", "2026-10-29");
  expect(readSeen("u3")).toBeNull();
});

test("requiresAny needs one of its keys", () => {
  const sports = [entry("sports", "/sports", [[null, "تبويبات", "לשוניות"]])];
  sports[0].steps.push({ requiresAny: ["sports.coach", "sports.manage"], text: { ar: "لاعب", he: "שחקן" } });
  expect(visibleGuide(["sports.view"], sports)[0].steps).toHaveLength(1);
  expect(visibleGuide(["sports.coach"], sports)[0].steps).toHaveLength(2);
  expect(visibleGuide(["sports.manage"], sports)[0].steps).toHaveLength(2);
  expect(visibleGuide([], sports)).toEqual([]);
});

test("PDF sections: the summary, then numbered steps", () => {
  const ui = { whatFor: "الشاشة" };
  const [first] = guidePdfSections(visibleGuide(["users.approve"], guide), "ar", ui);
  expect(first.title).toBe("عنوان dashboard");
  expect(first.rows).toEqual([
    { key: "الشاشة", value: "ملخص", full: true },
    { key: "1", value: "أرقام", full: true },
    { key: "2", value: "قبول", full: true },
  ]);
});

test("a long entry is cut into PDF sections of at most four rows", () => {
  const { GUIDE } = require("./guideContent");
  const { ALL_KEYS } = require("../utils/permissionKeys");
  const sections = guidePdfSections(visibleGuide(ALL_KEYS, GUIDE), "he", { whatFor: "המסך" });
  sections.forEach((s) => expect(s.rows.length).toBeLessThanOrEqual(PDF_ROWS_PER_SECTION));
  const dashboard = sections.filter((s) => s.title.startsWith("לוח הבקרה"));
  expect(dashboard.map((s) => s.title)).toEqual(["לוח הבקרה", "לוח הבקרה …"]);
  expect(dashboard[1].rows[0].key).toBe("4");
});
