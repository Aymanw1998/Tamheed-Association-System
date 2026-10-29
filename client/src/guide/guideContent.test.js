import { CHAPTERS } from "../journey/chapters";
import { ALL_KEYS, PERMISSION_TREE } from "../utils/permissionKeys";
import { SECTIONS } from "../tours/sections";
import { GUIDE, GUIDE_LANGS, GUIDE_PENDING, GUIDE_UI } from "./guideContent";

const isKey = (key) => ALL_KEYS.includes(key) || Object.hasOwn(PERMISSION_TREE, key);
const keysOf = (requires) => (requires == null ? [] : [].concat(requires));

test("every section has a guide entry or is listed as pending", () => {
  const covered = new Set([...GUIDE.map((e) => e.id), ...GUIDE_PENDING]);
  const missing = Object.keys(SECTIONS).filter((id) => !covered.has(id));
  expect(missing).toEqual([]);
});

test("a section with an entry is no longer pending, and ids are unique", () => {
  const ids = GUIDE.map((e) => e.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.filter((id) => GUIDE_PENDING.includes(id))).toEqual([]);
  expect(GUIDE_PENDING.filter((id) => !SECTIONS[id])).toEqual([]);
});

test("each entry matches its section's page and journey chapter", () => {
  GUIDE.forEach((entry) => {
    expect(SECTIONS[entry.id]).toBeDefined();
    expect(entry.path).toBe(SECTIONS[entry.id].path);
    expect(entry.chapterId).toBe(SECTIONS[entry.id].chapterId);
    if (entry.chapterId) expect(CHAPTERS.some((c) => c.id === entry.chapterId)).toBe(true);
  });
});

test("every text is written in every language", () => {
  GUIDE_LANGS.forEach((lang) => {
    expect(Object.keys(GUIDE_UI[lang]).sort()).toEqual(Object.keys(GUIDE_UI.ar).sort());
    Object.values(GUIDE_UI[lang]).forEach((text) => expect(text.trim()).not.toBe(""));
    GUIDE.forEach((entry) => {
      [entry.title, entry.summary, ...entry.steps.map((s) => s.text)].forEach((text) => {
        expect(typeof text[lang]).toBe("string");
        expect(text[lang].trim()).not.toBe("");
      });
    });
  });
});

test("steps need only real permission keys, and dates are YYYY-MM-DD with an optional letter", () => {
  GUIDE.forEach((entry) => {
    expect(entry.updated).toMatch(/^\d{4}-\d{2}-\d{2}[a-z]?$/);
    expect(entry.steps.length).toBeGreaterThan(0);
    entry.steps.forEach((step) => keysOf(step.requires).forEach((key) => expect(isKey(key)).toBe(true)));
  });
});
