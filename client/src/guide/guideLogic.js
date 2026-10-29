import { held } from "../journey/journeyLogic";
import { canAccessPath } from "../utils/routeAccess";
import { GUIDE, GUIDE_LANGS } from "./guideContent";

// Pure rules of the user guide (no DOM, no React).

// The entries whose screen this user can open, each with only the steps the
// user can do. An entry left with no step is dropped.
export function visibleGuide(permissions, guide = GUIDE) {
  const list = Array.isArray(permissions) ? permissions : [];
  return guide
    .filter((entry) => canAccessPath(entry.path, list))
    .map((entry) => ({ ...entry, steps: entry.steps.filter((step) => held(list, step.requires ?? null)) }))
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
