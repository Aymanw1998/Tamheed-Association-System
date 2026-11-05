// A new version installs itself, without a button and without losing what someone
// is typing (owner, 2026-11-05): the page reloads at a moment nothing would be lost,
// so right away if nothing was typed, or after the person moves to another page.
export const SETTLE_MS = 3000; // a success message on the next page stays readable
export const RETRY_GAP_MS = 5 * 60 * 1000; // never a reload loop
const TICK_MS = 1000;
const LAST_KEY = "autoUpdateAt";
const FIELDS = "input:not([type=hidden]),textarea,select";

const isField = (target) => ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName);

export function createAutoUpdate({
  doc = document,
  getPath = () => window.location.pathname,
  canApply = () => true,
  now = () => Date.now(),
  store = window.sessionStorage,
} = {}) {
  let edited = false;
  let path = getPath();
  let settleUntil = 0;

  const onEdit = (event) => { if (isField(event.target)) edited = true; };
  doc.addEventListener("input", onEdit, true);
  doc.addEventListener("change", onEdit, true);

  const stop = () => {
    doc.removeEventListener("input", onEdit, true);
    doc.removeEventListener("change", onEdit, true);
  };

  // Moving to another page ends what was being typed.
  const notePath = () => {
    const current = getPath();
    if (current === path) return;
    path = current;
    edited = false;
    settleUntil = now() + SETTLE_MS;
  };

  const recentlyTried = () => {
    try {
      return now() - (Number(store.getItem(LAST_KEY)) || 0) < RETRY_GAP_MS;
    } catch {
      return true; // no storage: no way to guard against a loop
    }
  };

  const safeNow = () => {
    notePath();
    if (now() < settleUntil || !canApply() || recentlyTried()) return false;
    return !edited || !doc.querySelector(FIELDS);
  };

  const markTried = () => {
    try { store.setItem(LAST_KEY, String(now())); } catch { /* recentlyTried stops it */ }
  };

  return { safeNow, markTried, stop };
}

// Called with the waiting worker: tells it to take over at the first safe moment.
export function applyWhenSafe(worker, guard = createAutoUpdate(), {
  reload = () => window.location.reload(),
  serviceWorker = navigator.serviceWorker,
  tickMs = TICK_MS,
} = {}) {
  let timer = null;
  const go = () => {
    if (!guard.safeNow()) return;
    clearInterval(timer);
    guard.markTried();
    let done = false;
    const finish = () => { if (!done) { done = true; reload(); } };
    serviceWorker?.addEventListener("controllerchange", finish);
    try {
      worker.postMessage({ type: "SKIP_WAITING" });
    } catch {
      finish();
    }
    setTimeout(finish, 3000);
  };
  timer = setInterval(go, tickMs);
  go();
  return () => clearInterval(timer);
}
