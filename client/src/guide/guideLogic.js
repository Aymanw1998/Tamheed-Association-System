import { held } from "../journey/journeyLogic";
import { canAccessPath } from "../utils/routeAccess";
import { GUIDE, GUIDE_LANGS } from "./guideContent";

// Pure rules of the user guide (no DOM, no React).

// A step needs all of `requires` and, when given, one of `requiresAny`.
const canDo = (permissions, step) =>
  held(permissions, step.requires ?? null) &&
  (!step.requiresAny || step.requiresAny.some((key) => held(permissions, key)));

// The entries whose screen this user can open, each with only the steps the
// user can do. An entry left with no step is dropped.
export function visibleGuide(permissions, guide = GUIDE) {
  const list = Array.isArray(permissions) ? permissions : [];
  return guide
    .filter((entry) => canAccessPath(entry.path, list))
    .map((entry) => ({ ...entry, steps: entry.steps.filter((step) => canDo(list, step)) }))
    .filter((entry) => entry.steps.length > 0);
}

const textsOf = (entry, lang) => [entry.title, entry.summary, ...entry.steps.map((s) => s.text)].map((t) => t[lang] || "");

// Every word of the query must appear somewhere in the entry, in this language.
export function searchGuide(entries, query, lang) {
  const words = String(query || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return entries;
  return entries.filter((entry) => {
    const text = textsOf(entry, lang).join(" ").toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

// seen: { [entry id]: the `updated` the user last saw }. An entry is new when
// its `updated` differs from that, or it was not there before (a new screen or
// a newly granted one). Nothing is new on the first visit (seen is null).
export function newEntryIds(entries, seen) {
  if (!seen) return [];
  return entries.filter((entry) => seen[entry.id] !== entry.updated).map((entry) => entry.id);
}

// What this visit saw, kept with what earlier visits saw of entries the user
// cannot see now (so a permission given back later does not look new).
export const seenAfter = (entries, seen) => ({
  ...(seen || {}),
  ...Object.fromEntries(entries.map((entry) => [entry.id, entry.updated])),
});

export const pickLang = (value) => (GUIDE_LANGS.includes(value) ? value : "ar");

// The language and the last visit are per device conveniences only.
const LANG_KEY = "guide.lang";
const seenKey = (userId) => `guide.seen.${userId || "anon"}`;

const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the guide still works, it just forgets.
  }
};

export const readLang = () => pickLang(read(LANG_KEY));
export const writeLang = (lang) => write(LANG_KEY, pickLang(lang));
export const readSeen = (userId) => {
  try {
    const parsed = JSON.parse(read(seenKey(userId)));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};
export const writeSeen = (userId, seen) => write(seenKey(userId), JSON.stringify(seen));

// The PDF lays sections out whole and never splits one, so a long entry is cut
// into sections of at most this many rows (an 8-row section overflows page 1).
export const PDF_ROWS_PER_SECTION = 4;

// The guide as PDF sections (Components/ExportPDF exportCardPdf): its summary
// and then its numbered steps, in this language; a continued part repeats the
// title with "…".
export const guidePdfSections = (entries, lang, ui) =>
  entries.flatMap((entry) => {
    const rows = [
      { key: ui.whatFor, value: entry.summary[lang], full: true },
      ...entry.steps.map((step, i) => ({ key: String(i + 1), value: step.text[lang], full: true })),
    ];
    const parts = [];
    for (let i = 0; i < rows.length; i += PDF_ROWS_PER_SECTION) {
      parts.push({
        title: i === 0 ? entry.title[lang] : `${entry.title[lang]} …`,
        rows: rows.slice(i, i + PDF_ROWS_PER_SECTION),
      });
    }
    return parts;
  });
