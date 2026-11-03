import { useEffect, useRef, useState } from "react";
import { pushSupported, pushOnServer, isSubscribed, resyncSport, subscribeSport } from "./pushOptIn";

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
// The system must also send notifications (the staff can switch them off).
function canOffer() {
  if (typeof window === "undefined" || !("PushManager" in window) || !("Notification" in window)) return false;
  if (Notification.permission === "denied") return false; // "default" and "granted" (no subscription yet) may be offered
  if (isIos() && !isStandalone()) return false;
  return pushSupported();
}

export default function PushButton() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  // Numbers each check; subscribing bumps it, so a check that was on its way
  // before then cannot bring the button back.
  const latest = useRef(0);

  // Checked again whenever the site comes back to the screen: the staff may
  // have switched notifications on or off meanwhile. Only the newest check counts.
  useEffect(() => {
    let alive = true;
    const check = () => {
      if (document.visibilityState === "hidden" || !canOffer()) return;
      const n = ++latest.current;
      Promise.all([pushOnServer(), isSubscribed()])
        .then(async ([serverOn, on]) => {
          // Subscribed in the browser: register it again (idempotent on the
          // server; the first POST may have failed, or another tab made a new
          // one). The button stays as the retry while the server lacks it.
          if (!serverOn) return false;
          return !on || !(await resyncSport());
        })
        .then((offer) => { if (alive && n === latest.current) setShow(offer); });
    };
    check();
    document.addEventListener("visibilitychange", check);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  if (!show) return null;

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    latest.current += 1;
    const r = await subscribeSport();
    latest.current += 1;
    setBusy(false);
    if (r.ok || r.reason === "denied") setShow(false);
  };

  return (
    <button type="button" className="btn push-btn" onClick={enable} disabled={busy}>
      فعّل الإشعارات
    </button>
  );
}
