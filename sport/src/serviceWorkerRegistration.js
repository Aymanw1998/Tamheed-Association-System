// Registers the service worker in production builds only. Pages that want to
// know about a waiting update subscribe with onUpdate(cb).
const listeners = new Set();
let waiting = null;

export function onUpdate(cb) {
  listeners.add(cb);
  if (waiting) cb(waiting);
  return () => listeners.delete(cb);
}

function announce(worker) {
  waiting = worker;
  listeners.forEach((cb) => {
    try { cb(worker); } catch {}
  });
}

export function register() {
  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${process.env.PUBLIC_URL || ""}/service-worker.js`)
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) announce(sw);
          });
        });
      })
      .catch((err) => console.error("[sw] registration failed", err));
  });
}
