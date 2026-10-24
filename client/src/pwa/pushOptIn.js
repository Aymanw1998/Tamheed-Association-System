// Phone notifications for staff: subscribes this device to Web Push and tells
// the server. Needs the service worker (production builds only).
import api from "../WebServer/services/api";

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

export async function isSubscribed() {
  try {
    if (!pushSupported()) return false;
    return !!(await currentSubscription()).sub;
  } catch {
    return false;
  }
}

// Resolves { ok: true } or { ok: false, reason: "denied" | "unavailable" | "failed" }.
export async function subscribeStaff() {
  try {
    if (!pushSupported()) return { ok: false, reason: "unavailable" };
    if ((await Notification.requestPermission()) !== "granted") return { ok: false, reason: "denied" };
    const { data } = await api.get("/push/key");
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
    await api.post("/push/subscribe", { subscription: sub.toJSON() });
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

// Best effort: the device stops receiving even if the server cannot be reached.
export async function unsubscribeStaff() {
  try {
    if (!pushSupported()) return { ok: true };
    const { sub } = await currentSubscription();
    if (!sub) return { ok: true };
    try {
      await api.delete("/push/subscribe", { data: { subscription: sub.toJSON() } });
    } catch {}
    await sub.unsubscribe();
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
