// Phone reminders for students: subscribes this device to Web Push and tells
// the server. Needs the service worker (production builds only).
const KEY_URL = "/api/push/key";
const SUBSCRIBE_URL = "/api/sport-portal/push/subscribe";

export const pushSupported = () =>
  typeof window !== "undefined" &&
  "PushManager" in window &&
  "Notification" in window &&
  typeof navigator !== "undefined" &&
  "serviceWorker" in navigator;

function keyToBytes(base64) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function sameKey(current, wanted) {
  if (!current) return true; // browser does not expose it: keep the subscription
  const a = new Uint8Array(current);
  return a.length === wanted.length && a.every((v, i) => v === wanted[i]);
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return { reg: null, sub: null };
  return { reg, sub: await reg.pushManager.getSubscription() };
}

async function send(method, subscription) {
  const res = await fetch(SUBSCRIBE_URL, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription }),
  });
  if (!res.ok) throw new Error("subscribe failed");
}

export async function isSubscribed() {
  try {
    if (!pushSupported()) return false;
    return !!(await currentSubscription()).sub;
  } catch {
    return false;
  }
}

// Resolves { ok: true } or { ok: false, reason: "denied" | "unavailable" | "failed" }.
export async function subscribeSport() {
  try {
    if (!pushSupported()) return { ok: false, reason: "unavailable" };
    // Already granted: just subscribe, without asking again.
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: "denied" };
    const res = await fetch(KEY_URL, { credentials: "same-origin" });
    const data = res.ok ? await res.json() : null;
    if (!data?.ok || !data.key) return { ok: false, reason: "unavailable" };
    const { reg, sub: found } = await currentSubscription();
    if (!reg) return { ok: false, reason: "unavailable" };
    const serverKey = keyToBytes(data.key);
    let existing = found;
    // A subscription made with another server key can never receive pushes.
    if (existing && !sameKey(existing.options?.applicationServerKey, serverKey)) {
      await existing.unsubscribe();
      existing = null;
    }
    const sub = existing || (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: serverKey,
    }));
    await send("POST", sub.toJSON());
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

// Best effort: the device stops receiving even if the server cannot be reached.
export async function unsubscribeSport() {
  try {
    if (!pushSupported()) return { ok: true };
    const { sub } = await currentSubscription();
    if (!sub) return { ok: true };
    try {
      await send("DELETE", sub.toJSON());
    } catch {}
    await sub.unsubscribe();
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
