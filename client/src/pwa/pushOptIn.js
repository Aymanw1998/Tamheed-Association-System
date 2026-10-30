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

// Browser only, no API call: after a forced session end or a new sign-in the
// device must not stay subscribed for the previous user. Best effort, ~3s cap.
// The server row removes itself when the push service answers 410.
export async function dropDevicePush() {
  let timer;
  const work = (async () => {
    try {
      if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
      const { sub } = await currentSubscription();
      if (sub) await sub.unsubscribe();
    } catch {}
  })();
  const cap = new Promise((resolve) => { timer = setTimeout(resolve, 3000); });
  try { await Promise.race([work, cap]); } catch {}
  clearTimeout(timer);
}

// Re-sends an existing browser subscription (idempotent on the server), so a
// failed earlier POST is repaired. Best effort.
export async function resyncStaff() {
  try {
    if (!pushSupported()) return;
    const { sub } = await currentSubscription();
    if (sub) await api.post("/push/subscribe", { subscription: sub.toJSON() });
  } catch {}
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

// Whether the system sends phone notifications at all (an admin switch on the
// server: the key is null while it is off). False on any failure.
export async function pushOnServer() {
  try {
    const { data } = await api.get("/push/key");
    return Boolean(data?.ok && data.key);
  } catch {
    return false;
  }
}

// iPhone and iPad get notifications only from the site added to the home screen.
export function needsHomeScreen() {
  if (typeof navigator === "undefined") return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!ios) return false;
  try {
    return !(window.navigator.standalone === true || window.matchMedia?.("(display-mode: standalone)")?.matches === true);
  } catch {
    return true;
  }
}

export const getPushSettings = () => api.get("/push/settings").then((r) => r.data);
export const setPushSettings = (enabled) => api.put("/push/settings", { enabled }).then((r) => r.data);
