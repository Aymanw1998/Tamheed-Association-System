import { hasPermission } from "../utils/permissionKeys";
import { TOURS } from "./registry";
import { RELEASES } from "./releases";
import { SECTION_OF } from "./sections";

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
    if (mod === "permissions" || knownSections.has(section)) abilities.add(section);
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
