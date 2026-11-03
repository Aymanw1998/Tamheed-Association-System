// Installing the web app on a phone (owner, 2026-11-01: a button for people
// who do not know how). The browser's install prompt (Android, Chrome) is
// caught here once for the whole app, and any button can open the guide.
// The same file is in apps/sport/src/pwa.

let deferred = null;
const listeners = new Set();
const guideListeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

// "installed" (opened from the home screen), "android", "ios-safari",
// "ios-other" (Chrome and others on iPhone) or "desktop".
export function installPlatform(w = window) {
  try {
    const nav = w.navigator || {};
    if (w.matchMedia?.("(display-mode: standalone)")?.matches === true || nav.standalone === true) return "installed";
    const ua = nav.userAgent || "";
    const ios = /iPad|iPhone|iPod/.test(ua) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
    if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? "ios-other" : "ios-safari";
    if (/Android/.test(ua)) return "android";
    return "desktop";
  } catch {
    return "desktop";
  }
}

export const isPhone = (platform = installPlatform()) => ["android", "ios-safari", "ios-other"].includes(platform);

export const canPromptInstall = () => Boolean(deferred);

// "accepted", "dismissed" or "unavailable" (no prompt from the browser).
export async function promptInstall() {
  const evt = deferred;
  if (!evt) return "unavailable";
  deferred = null;
  notify();
  try {
    await evt.prompt();
    const choice = await evt.userChoice;
    return choice?.outcome === "accepted" ? "accepted" : "dismissed";
  } catch {
    return "dismissed";
  }
}

export function subscribeInstall(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const openInstallGuide = () => guideListeners.forEach((fn) => fn());

export function onInstallGuide(fn) {
  guideListeners.add(fn);
  return () => guideListeners.delete(fn);
}
