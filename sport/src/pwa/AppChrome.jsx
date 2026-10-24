import React, { useEffect, useState } from "react";
import { onUpdate } from "../serviceWorkerRegistration";

const HINT_KEY = "pwa_ios_hint_dismissed";

function readFlag() {
  try { return localStorage.getItem(HINT_KEY) === "1"; } catch { return false; }
}
function writeFlag() {
  try { localStorage.setItem(HINT_KEY, "1"); } catch {}
}

function isStandalone() {
  try {
    return (
      window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
      window.navigator.standalone === true
    );
  } catch { return false; }
}

function isIosSafari() {
  const ua = window.navigator.userAgent || "";
  const ios = /iPad|iPhone|iPod/.test(ua) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

// The bottom tab bar is 60px tall plus the device inset; the bars sit above it.
const TABS_OFFSET = "calc(60px + env(safe-area-inset-bottom))";

const wrap = {
  position: "fixed",
  insetInline: 0,
  bottom: 0,
  zIndex: 9500,
  display: "flex",
  flexDirection: "column",
  pointerEvents: "none",
};
const bar = {
  pointerEvents: "auto",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  padding: "6px 12px",
  fontSize: 14,
  lineHeight: 1.5,
  fontWeight: 600,
  color: "#fff",
  background: "#0b2a3a",
  borderTop: "1px solid rgba(255,255,255,.18)",
};
const btn = {
  font: "inherit",
  color: "#0b2a3a",
  background: "#fff",
  border: 0,
  borderRadius: 6,
  padding: "2px 12px",
  cursor: "pointer",
};

export default function AppChrome({ aboveTabs = false }) {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  const [worker, setWorker] = useState(null);
  const [installEvt, setInstallEvt] = useState(null);
  const [hintDismissed, setHintDismissed] = useState(readFlag);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => onUpdate(setWorker), []);

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setInstallEvt(e); };
    const onInstalled = () => setInstallEvt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    setShowIosHint(isIosSafari() && !isStandalone());
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const reload = () => {
    if (!worker) return;
    let done = false;
    const go = () => { if (!done) { done = true; window.location.reload(); } };
    navigator.serviceWorker?.addEventListener("controllerchange", go);
    try {
      worker.postMessage({ type: "SKIP_WAITING" });
    } catch {
      go();
    }
    setTimeout(go, 3000);
  };

  const install = async () => {
    const evt = installEvt;
    if (!evt) return;
    setInstallEvt(null);
    try { await evt.prompt(); } catch {}
  };

  const dismissHint = () => { writeFlag(); setHintDismissed(true); };

  const iosHint = showIosHint && !hintDismissed && !installEvt;

  if (online && !worker && !installEvt && !iosHint) return null;

  return (
    <div dir="rtl" style={aboveTabs ? { ...wrap, bottom: TABS_OFFSET } : wrap} data-testid="app-chrome">
      {!online && (
        <div role="status" style={{ ...bar, background: "#7a4b00" }}>
          لا يوجد اتصال – البيانات من آخر تحديث
        </div>
      )}
      {worker && (
        <div role="status" style={bar}>
          <button type="button" style={btn} onClick={reload}>
            يوجد تحديث – إعادة التحميل
          </button>
        </div>
      )}
      {installEvt && (
        <div style={bar}>
          <button type="button" style={btn} onClick={install}>
            تثبيت التطبيق
          </button>
        </div>
      )}
      {iosHint && (
        <div role="status" style={bar}>
          <span>للتثبيت: اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية»</span>
          <button type="button" style={btn} onClick={dismissHint} aria-label="إغلاق">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
