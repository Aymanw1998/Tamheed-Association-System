// Empties the offline API cache. Called whenever a session starts or ends so
// one person's cached answers are never shown to the next. Never throws.
export const API_CACHE = "tamheed-api";

export async function clearApiCache() {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_API_CACHE" });
  } catch {}
  try {
    if (typeof caches !== "undefined") await caches.delete(API_CACHE);
  } catch {}
}
