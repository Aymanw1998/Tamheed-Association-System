// One random id per browser tab. sessionStorage is per tab and survives a
// reload, so a reloaded tab keeps (and can release) its own locks, while the
// same user in another tab gets a different id and is blocked like anyone else.
const STORAGE_KEY = "tamheed-client-id";
let fallbackId = null;

function randomId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

export function getClientId() {
  try {
    let id = sessionStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = randomId();
      sessionStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    // Storage blocked: one id for the life of the page.
    if (!fallbackId) fallbackId = randomId();
    return fallbackId;
  }
}
