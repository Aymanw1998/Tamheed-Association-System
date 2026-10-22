import { hasPermission } from "../utils/permissionKeys";

// Pure rules of the guided journey (no DOM, no React).
// Chapter: { id: "journey-<name>", title, route, requires: string|string[]|null, steps }
// Step:    { target: string|null, mood, title, body, requires?, action? }
// `tours` is the server's tour state: { [id]: { status: "done"|"skipped", version } }.

export const INTRO_ID = "journey-intro";

// `requires` is one key, or an array of keys that are all needed.
const held = (permissions, key) => {
  if (key == null) return true;
  if (Array.isArray(key)) return key.every((k) => hasPermission(permissions, k));
  return hasPermission(permissions, key);
};

// The chapters, and the steps inside them, this user may see. A chapter left
// with no step is dropped. The input is never changed.
export function availableChapters(chapters, permissions) {
  if (!Array.isArray(chapters)) return [];
  const list = Array.isArray(permissions) ? permissions : [];
  return chapters
    .filter((chapter) => chapter && held(list, chapter.requires ?? null))
    .map((chapter) => ({
      ...chapter,
      steps: (Array.isArray(chapter.steps) ? chapter.steps : []).filter((step) => held(list, step?.requires ?? null)),
    }))
    .filter((chapter) => chapter.steps.length > 0);
}

// "Continue" means the first chapter neither done nor skipped, from its start.
export function nextChapter(chapters, tours) {
  const state = tours && typeof tours === "object" ? tours : {};
  return (Array.isArray(chapters) ? chapters : []).find((chapter) => !state[chapter.id]) || null;
}

// Every user, new or old, is offered the journey once: it is stored under its
// own id, so finishing the old welcome tour does not count.
export const shouldOfferJourney = (tours) => !(tours && typeof tours === "object" && tours[INTRO_ID]);

const trim = (path) => String(path || "").replace(/\/+$/, "") || "/";

// The chapter whose route is this page or one of its records ("/students/abc"
// belongs to "/students"); the longest matching route wins.
export function chapterForPath(chapters, pathname) {
  const path = trim(pathname);
  let best = null;
  (Array.isArray(chapters) ? chapters : []).forEach((chapter) => {
    const route = trim(chapter.route);
    const match = path === route || (route !== "/" && path.startsWith(`${route}/`));
    if (match && (!best || route.length > trim(best.route).length)) best = chapter;
  });
  return best;
}

// What the offer card shows: { kind: "intro" } the first time, then
// { kind: "resume", chapter } while chapters are left. At sign-in (`auto`), a
// user who skipped the intro card and recorded nothing else is not asked again.
export function journeyOffer(chapters, tours, { auto = false } = {}) {
  const state = tours && typeof tours === "object" ? tours : {};
  if (shouldOfferJourney(state)) return { kind: "intro" };
  if (auto && state[INTRO_ID].status === "skipped") {
    const other = (Array.isArray(chapters) ? chapters : []).some((c) => c.id !== INTRO_ID && state[c.id]);
    if (!other) return null;
  }
  const chapter = nextChapter(chapters, state);
  return chapter ? { kind: "resume", chapter } : null;
}

// Chapters that explain no screen of their own: the intro (the menu and the
// help button) and the assistant (a panel on every page). The help center
// lists them, but «شرح هذه الشاشة» never picks them.
const NOT_A_SCREEN = new Set([INTRO_ID, "journey-assistant"]);

// The chapter «شرح هذه الشاشة» runs for this page, among the user's chapters.
export const screenChapter = (chapters, pathname) =>
  chapterForPath((Array.isArray(chapters) ? chapters : []).filter((c) => !NOT_A_SCREEN.has(c.id)), pathname);
