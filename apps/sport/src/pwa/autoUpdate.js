// Each page adopts a new build automatically once its local work is safe.
export const SETTLE_MS = 3000;
export const RETRY_GAP_MS = 5 * 60 * 1000;
const TICK_MS = 1000;
const LAST_KEY = "autoUpdateAt";
const FIELDS = "input:not([type=hidden]),textarea,select";
const isField = (target) => ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName);
const sessionStore = () => { try { return window.sessionStorage; } catch { return null; } };

export function createAutoUpdate({
  doc = document,
  getPath = () => window.location.pathname,
  canApply = () => true,
  now = () => Date.now(),
  store = sessionStore(),
} = {}) {
  let edited = false, richDraft = false;
  let path = getPath(), settleUntil = 0, lastTried = -Infinity;
  const onEdit = (event) => {
    notePath(); // Attribute the edit to its current route before an update arrives.
    if (isField(event.target)) edited = true;
    if (event.target?.closest?.('[contenteditable]:not([contenteditable="false"])')) richDraft = true;
  };
  const onPointer = (event) => { notePath(); if (event.target?.tagName === "CANVAS") richDraft = true; };
  doc.addEventListener("input", onEdit, true);
  doc.addEventListener("change", onEdit, true);
  doc.addEventListener("pointerdown", onPointer, true);
  const stop = () => {
    doc.removeEventListener("input", onEdit, true);
    doc.removeEventListener("change", onEdit, true);
    doc.removeEventListener("pointerdown", onPointer, true);
  };
  const notePath = () => {
    const current = getPath();
    if (current === path) return;
    path = current; edited = false; richDraft = false;
    settleUntil = now() + SETTLE_MS;
  };
  const recentlyTried = () => {
    let stored;
    try { stored = store?.getItem(LAST_KEY); } catch {}
    const previous = stored == null ? lastTried : Number(stored);
    const age = now() - previous;
    return Number.isFinite(previous) && age >= 0 && age < RETRY_GAP_MS;
  };
  const safeNow = () => {
    notePath();
    if (now() < settleUntil || !canApply() || recentlyTried() || richDraft) return false;
    if (doc.querySelector('[role="dialog"], [role="alertdialog"], [aria-busy="true"]')) return false;
    return !edited || !doc.querySelector(FIELDS);
  };
  const markTried = () => {
    lastTried = now();
    try { store?.setItem(LAST_KEY, String(lastTried)); } catch {}
  };
  return { safeNow, markTried, stop };
}

// A different tab may activate the worker while this page still has edits.
// Listen immediately and re-check safety at reload time, not just activation time.
export function applyWhenSafe(worker, guard = createAutoUpdate(), {
  reload = () => window.location.reload(),
  serviceWorker = navigator.serviceWorker,
  tickMs = TICK_MS,
} = {}) {
  let done = false, stopped = false, requested = false;
  let activated = worker?.state === "activated";
  let timer;
  const onController = () => { activated = true; go(); };
  const cleanup = () => { clearInterval(timer); serviceWorker?.removeEventListener?.("controllerchange", onController); };
  const go = () => {
    if (stopped || done || !guard.safeNow()) return;
    if (activated || worker?.state === "activated") {
      done = true; cleanup(); guard.markTried(); reload();
    } else if (!requested) {
      requested = true;
      try { worker.postMessage({ type: "SKIP_WAITING" }); }
      catch { requested = false; }
    }
  };
  serviceWorker?.addEventListener("controllerchange", onController);
  timer = setInterval(go, tickMs);
  go();
  return () => { stopped = true; cleanup(); };
}
