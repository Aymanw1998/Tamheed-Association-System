import { useEffect, useState } from "react";
import { pushSupported, isSubscribed, subscribeSport } from "./pushOptIn";

function isIos() {
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  try {
    return window.navigator.standalone === true || window.matchMedia?.("(display-mode: standalone)")?.matches === true;
  } catch {
    return false;
  }
}

// Shown only when the browser can receive pushes, notifications are not blocked
// and there is no subscription yet, and (on iOS) the site is installed on the home screen.
function canOffer() {
  if (typeof window === "undefined" || !("PushManager" in window) || !("Notification" in window)) return false;
  if (Notification.permission === "denied") return false; // "default" and "granted" (no subscription yet) may be offered
  if (isIos() && !isStandalone()) return false;
  return pushSupported();
}

export default function PushButton() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!canOffer()) return undefined;
    isSubscribed().then((on) => { if (alive && !on) setShow(true); });
    return () => { alive = false; };
  }, []);

  if (!show) return null;

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    const r = await subscribeSport();
    setBusy(false);
    if (r.ok || r.reason === "denied") setShow(false);
  };

  return (
    <button type="button" className="btn push-btn" onClick={enable} disabled={busy}>
      فعّل التذكير بالتدريبات
    </button>
  );
}
