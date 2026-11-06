// History is bounded by this signed-in layout, never by an external referrer.
export const initialHistory = (location) => ({ entries: [location], index: 0 });
export function recordLocation(history, location, action) {
  const current = history.entries[history.index];
  if (current.key === location.key) return history;
  if (action === "REPLACE") {
    const entries = [...history.entries]; entries[history.index] = location;
    return { entries, index: history.index };
  }
  if (action === "POP") {
    const index = history.entries.findIndex((entry) => entry.key === location.key);
    return index >= 0 ? { ...history, index } : initialHistory(location);
  }
  const entries = [...history.entries.slice(0, history.index + 1), location];
  return { entries, index: entries.length - 1 };
}

export function parentDestination(path) {
  const edit = path.match(/^\/(lessons|students|users)\/([^/]+)\/edit$/);
  if (edit) return `/${edit[1]}/${edit[2]}`;
  if (path === "/weekly-tasks/manage") return "/weekly-tasks";
  if (/^\/calendar$/.test(path)) return "/lessons";
  const section = path.match(/^\/(lessons|students|users|reports|vehicles)\/[^/]+$/);
  return section ? `/${section[1]}` : "/dashboard";
}

// Lists often load after the route mounts. Wait for enough document height to
// restore the saved position, and stop immediately if the person interacts.
export function restorePageScroll(position, win = window, doc = document) {
  let stopped = false, observer, timer;
  const events = ["wheel", "touchstart", "pointerdown", "keydown"];
  const stop = () => {
    stopped = true; observer?.disconnect(); win.clearTimeout(timer);
    events.forEach((event) => win.removeEventListener(event, stop));
  };
  const apply = () => {
    if (stopped) return;
    const height = Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight || 0);
    if (position.y > 0 && height - win.innerHeight < position.y) return;
    win.scrollTo(position.x, position.y); stop();
  };
  events.forEach((event) => win.addEventListener(event, stop, { passive: true }));
  if (win.ResizeObserver) { observer = new win.ResizeObserver(apply); observer.observe(doc.body || doc.documentElement); }
  timer = win.setTimeout(stop, 30000);
  apply();
  return stop;
}
