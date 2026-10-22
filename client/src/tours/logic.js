import { hasPermission } from "../utils/permissionKeys";
import { INTRO_ID } from "../journey/journeyLogic";
import { RELEASES } from "./releases";
import { SECTION_OF, SECTIONS } from "./sections";

export const can = (permissions, key) => (key == null ? true : hasPermission(permissions, key));

// Resolves true once `busy()` is false, polling with `pause()`; false if
// `cancelled()` turns true meanwhile.
export async function waitWhile(busy, { pause, cancelled }) {
  while (busy()) {
    await pause();
    if (cancelled()) return false;
  }
  return true;
}

const moduleOf = (key) => String(key).split(".")[0];

export const newAccess = (knownKeys, permissions) => {
  if (knownKeys == null) return { seed: true, sections: [], abilities: [] };
  const known = new Set(knownKeys);
  const knownSections = new Set(knownKeys.map((k) => SECTION_OF[moduleOf(k)]).filter(Boolean));
  const sections = new Set();
  const abilities = new Set();
  (permissions || []).filter((k) => !known.has(k)).forEach((key) => {
    const mod = moduleOf(key);
    const section = SECTION_OF[mod];
    if (!section) return;
    // Managing permissions only extends a section the user already has.
    if (mod === "permissions") {
      if (knownSections.has(section)) abilities.add(section);
    } else if (knownSections.has(section)) abilities.add(section);
    else sections.add(section);
  });
  sections.forEach((s) => abilities.delete(s));
  return { seed: false, sections: [...sections].sort(), abilities: [...abilities].sort() };
};

export const unseenReleases = (seen, permissions, releases = RELEASES) => {
  const done = new Set(seen || []);
  return releases.filter((r) => !done.has(r.id) && can(permissions, r.requires));
};

// The sign-in queue, shown after the journey offer: the new-access card, then
// "what's new". The old welcome tour is gone (the journey replaces it).
export const startupQueue = ({ state, permissions, deferred }, releases = RELEASES) => {
  const queue = [];
  const access = newAccess(state?.knownKeys ?? null, permissions);
  if (!access.seed) {
    if ((access.sections.length || access.abilities.length) && !deferred.has("access")) queue.push("access");
    if (unseenReleases(state?.seenReleases, permissions, releases).length) queue.push("releases");
  }
  return queue;
};

// The journey chapter a section's «أرني» runs (null when it has none).
export const sectionChapter = (section, sections = SECTIONS) => sections[section]?.chapterId || null;

// What a release's «أرني» starts: the journey release starts the full journey
// from its intro, any other release only the chapter it names.
export const releaseShowMe = (release) => {
  const chapterId = release?.tourId;
  if (!chapterId) return null;
  return { chapterId, only: chapterId !== INTRO_ID };
};

// Every release the user may see, unseen first, otherwise in list order (newest first).
export const helpReleases = (seen, permissions, releases = RELEASES) => {
  const done = new Set(seen || []);
  const allowed = releases.filter((r) => can(permissions, r.requires));
  return [...allowed.filter((r) => !done.has(r.id)), ...allowed.filter((r) => done.has(r.id))];
};

// The section whose page (or a page under it) is open.
export const sectionOfPath = (pathname, sections = SECTIONS) => {
  const path = String(pathname || "").replace(/\/+$/, "");
  const hit = Object.entries(sections).find(([, s]) => path === s.path || path.startsWith(`${s.path}/`));
  return hit ? hit[0] : null;
};

// Held keys of a section's modules that are not known yet ([] = nothing to save).
export const unknownSectionKeys = (section, permissions, knownKeys, sectionOf = SECTION_OF) => {
  if (!section || knownKeys == null) return [];
  const known = new Set(knownKeys);
  return (permissions || []).filter((k) => sectionOf[moduleOf(k)] === section && !known.has(k));
};

// Inputs that are not typed into (buttons, boxes, pickers).
const NOT_TYPED = new Set(["button", "submit", "reset", "checkbox", "radio", "file", "image", "range", "color", "hidden"]);

// True when the element takes typing (a tour must not steal its focus).
export const isTypingTarget = (el) => {
  if (!el || typeof el !== "object") return false;
  if (el.isContentEditable) return true;
  const tag = String(el.tagName || "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  return !NOT_TYPED.has(String(el.type || "text").toLowerCase());
};
