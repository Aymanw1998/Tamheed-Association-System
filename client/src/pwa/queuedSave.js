// Glue between the attendance screens and the offline queue.
import api from "../WebServer/services/api";
import { getStoredUserTz } from "../utils/session";
import { dropKey, enqueue, flush } from "./attendanceQueue";
import { isDemo } from "../journey/demoMode";

// Identifies one sheet: the same lesson and date always give the same key.
export function attendanceKey(item) {
  const b = item.body || {};
  // The sport url already holds the lesson id; the general one has it in the body.
  const when = item.kind === "sport" ? b.date : [b.lessonId, b.year, b.month, b.day].join("-");
  return [item.kind, item.url, when].join("|");
}

// After a successful online save, any older queued copy of that sheet is stale.
export async function dropQueuedSheet(item) {
  const tz = getStoredUserTz();
  if (!tz) return;
  try { await dropKey(tz, attendanceKey(item)); } catch {}
}

// True when the browser says it is offline, so a save should not even be tried.
export const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;
// True when a save never reached the server (the request got no response).
export const noResponse = (result) => !!result && result.ok === false && !result.status;

// Keeps a save on this device for the signed-in user. Resolves true when it
// was stored, false when it could not be (no user, or no IndexedDB).
export async function queueAttendance(item) {
  if (isDemo()) return false; // training mode never stores real attendance
  const tz = getStoredUserTz();
  if (!tz) return false;
  try {
    await enqueue(tz, { ...item, key: attendanceKey(item), queuedAt: Date.now() });
    return true;
  } catch {
    return false;
  }
}

// Sends one queued item with the app's own session handling.
export async function sendQueued(item) {
  try {
    const { data } = await (item.kind === "sport"
      ? api.put(item.url, item.body)
      : api.post(item.url, item.body));
    return { ok: true, status: 200, overwritten: data?.overwritten || [] };
  } catch (err) {
    return {
      ok: false,
      status: err?.response?.status || 0,
      message: err?.response?.data?.message || err?.message,
    };
  }
}

// Sends the signed-in user's queue; never anyone else's.
export function flushCurrentUser() {
  if (isDemo()) return Promise.resolve(null); // training mode never sends real attendance
  const tz = getStoredUserTz();
  if (!tz || localStorage.getItem("isLoggedIn") !== "1") return Promise.resolve(null);
  return flush(tz, sendQueued).catch(() => null);
}
