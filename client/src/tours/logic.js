import { hasPermission } from "../utils/permissionKeys";
import { TOURS } from "./registry";
import { RELEASES } from "./releases";
import { SECTION_OF, SECTIONS } from "./sections";

export const can = (permissions, key) => (key == null ? true : hasPermission(permissions, key));

export const usableSteps = (tour, { permissions, exists }) =>
  (tour?.steps || []).filter((s) =>
    can(permissions, s.requires ?? null) && (s.target == null || exists(s.target)));

export const tourForPath = (pathname, tours = TOURS) => {
  const path = String(pathname || "");
  const last = path.split("/").filter(Boolean).pop();
  const tour = tours.find((t) => t.route && t.route.test(path) && !(t.detail && last === "new"));
  return tour || null;
};

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

export const startupQueue = ({ state, permissions, deferred }, releases = RELEASES) => {
  const queue = [];
  const tours = state?.tours || {};
  if (!tours.welcome && !deferred.has("welcome")) queue.push("welcome");
  const access = newAccess(state?.knownKeys ?? null, permissions);
  if (!access.seed) {
    if ((access.sections.length || access.abilities.length) && !deferred.has("access")) queue.push("access");
    if (unseenReleases(state?.seenReleases, permissions, releases).length) queue.push("releases");
  }
  return queue;
};

export const pickText = (text, language) => (text && (text[language] || text.ar)) || "";

// The page a tour lives on, for tours the help center can open by navigating.
export const tourPath = (tourId, sections = SECTIONS) => {
  const entry = Object.values(sections).find((s) => s.tourId === tourId);
  return entry ? entry.path : null;
};

// Tours the help center lists: a page of their own the user can open, and permitted.
export const helpTours = ({ permissions, canOpen }, tours = TOURS, sections = SECTIONS) =>
  tours
    .map((tour) => ({ tour, path: tourPath(tour.id, sections) }))
    .filter(({ tour, path }) => path && can(permissions, tour.requires ?? null) && canOpen(path));

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
