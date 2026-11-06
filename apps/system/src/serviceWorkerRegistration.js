// Update checks cover open windows and installed apps, without an update button.
export const CHECK_EVERY_MS = 60 * 1000;
const listeners = new Set();
let waiting = null, started = false;

export function onUpdate(cb) {
  listeners.add(cb);
  if (waiting) cb(waiting);
  return () => listeners.delete(cb);
}
function announce(worker) {
  waiting = worker;
  listeners.forEach((cb) => { try { cb(worker); } catch {} });
}

export function watchRegistration(reg, {
  container = navigator.serviceWorker,
  win = window,
  doc = document,
  online = () => navigator.onLine !== false,
  initialController = container.controller,
} = {}) {
  let checking = false, previousController = initialController;
  const watched = new Map();
  const watchWorker = (worker) => {
    if (!worker || watched.has(worker)) return;
    const changed = () => { if (worker.state === "installed" && container.controller) announce(worker); };
    watched.set(worker, changed);
    worker.addEventListener("statechange", changed);
    changed();
  };
  const found = () => watchWorker(reg.installing);
  const controllerChanged = () => {
    const next = container.controller;
    // First installation claims a freshly loaded page; it needs no reload.
    if (next && previousController && next !== previousController) announce(next);
    previousController = next;
  };
  const check = async () => {
    if (doc.hidden || !online() || checking) return;
    checking = true;
    try { await reg.update(); } catch {} finally { checking = false; }
  };
  container.addEventListener("controllerchange", controllerChanged);
  controllerChanged();
  reg.addEventListener("updatefound", found);
  found(); // register() may have started installing before its promise resolved.
  if (reg.waiting && container.controller) announce(reg.waiting);
  const timer = win.setInterval(check, CHECK_EVERY_MS);
  doc.addEventListener("visibilitychange", check);
  win.addEventListener("focus", check);
  win.addEventListener("online", check);
  check();
  return () => {
    win.clearInterval(timer);
    doc.removeEventListener("visibilitychange", check);
    win.removeEventListener("focus", check); win.removeEventListener("online", check);
    container.removeEventListener("controllerchange", controllerChanged);
    reg.removeEventListener("updatefound", found);
    watched.forEach((changed, worker) => worker.removeEventListener("statechange", changed));
  };
}

export function register() {
  if (started || process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  started = true;
  const start = () => {
    const initialController = navigator.serviceWorker.controller;
    navigator.serviceWorker.register(`${process.env.PUBLIC_URL || ""}/service-worker.js`, { updateViaCache: "none" })
      .then((reg) => watchRegistration(reg, { initialController }))
      .catch((error) => console.error("[sw] registration failed", error));
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}
