import { RELEASES } from "./releases";
import { SECTIONS, SECTION_OF } from "./sections";
import { releaseShowMe } from "./logic";
import { CHAPTERS } from "../journey/chapters";

// Non-empty text with Arabic letters in it.
const filled = (t) => typeof t === "string" && t.trim().length > 0 && /[؀-ۿ]/.test(t);
const CHAPTER_IDS = new Set(CHAPTERS.map((c) => c.id));

test("modules map to known sections or null", () => {
  Object.values(SECTION_OF).forEach((s) => expect(s === null || SECTIONS[s]).toBeTruthy());
});

test("every section's «أرني» opens a real chapter of the journey", () => {
  Object.values(SECTIONS).forEach(({ chapterId }) => expect(CHAPTER_IDS.has(chapterId)).toBe(true));
});

test("releases are well formed", () => {
  const ids = RELEASES.map((r) => r.id);
  expect(new Set(ids).size).toBe(ids.length);
  RELEASES.forEach((r) => {
    expect(r.id).toMatch(/^[a-z0-9][a-z0-9-]{0,59}$/);
    expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(r.date))).toBe(false);
    expect(filled(r.title)).toBe(true);
    expect(filled(r.body)).toBe(true);
  });
});

test("every release tourId is a chapter id, and «أرني» opens it", () => {
  RELEASES.forEach((r) => {
    expect(r.tourId === null || CHAPTER_IDS.has(r.tourId)).toBe(true);
    const show = releaseShowMe(r);
    if (r.tourId === null) expect(show).toBeNull();
    else expect(CHAPTER_IDS.has(show.chapterId)).toBe(true);
  });
});

test("the guided journey release is the newest, and «أرني» starts the full journey", () => {
  expect(RELEASES[0].id).toBe("2026-10-22-guided-journey");
  expect(releaseShowMe(RELEASES[0])).toEqual({ chapterId: "journey-intro", only: false });
});
