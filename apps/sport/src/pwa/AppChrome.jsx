import React, { useEffect, useState } from "react";
import { onUpdate } from "../serviceWorkerRegistration";
import { applyWhenSafe, createAutoUpdate } from "./autoUpdate";
import { canPromptInstall, openInstallGuide, subscribeInstall } from "./installState";
import { InstallGuide } from "./InstallApp";

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

// In the page's flow, not fixed (owner, 2026-11-04): a fixed bar covers the buttons
// at the end of the page. Stuck to the bottom while scrolling; at the end of the
// page it sits after them.
const wrap = {
  position: "sticky",
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
  // The browser's install prompt is caught once, in installState.
  const [installEvt, setInstallEvt] = useState(canPromptInstall);
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

  useEffect(() => {
    // Started at once, so what is typed before an update arrives counts too.
    const guard = createAutoUpdate();
    let stopApplying = null;
    const off = onUpdate((worker) => { stopApplying?.(); stopApplying = applyWhenSafe(worker, guard); });
    return () => { off(); stopApplying?.(); guard.stop(); };
  }, []);

  useEffect(() => {
    setShowIosHint(isIosSafari() && !isStandalone());
    return subscribeInstall(() => setInstallEvt(canPromptInstall()));
  }, []);

  const dismissHint = () => { writeFlag(); setHintDismissed(true); };

  const iosHint = showIosHint && !hintDismissed && !installEvt;

  if (online && !installEvt && !iosHint) return <InstallGuide />;

  // The guide sits outside the wrapper: the wrapper lets clicks through
  // (pointer-events: none), which would make the guide unclickable.
  return (
    <>
    <div dir="rtl" style={aboveTabs ? { ...wrap, bottom: TABS_OFFSET } : wrap} data-testid="app-chrome">
      {!online && (
        <div role="status" style={{ ...bar, background: "#7a4b00" }}>
          لا يوجد اتصال – البيانات من آخر تحديث
        </div>
      )}
      {iosHint && (
        <div role="status" style={bar}>
          <span>للتثبيت: اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية»</span>
          <button type="button" style={btn} onClick={openInstallGuide}>
            كيف؟
          </button>
          <button type="button" style={btn} onClick={dismissHint} aria-label="إغلاق">
            ×
          </button>
        </div>
      )}
    </div>
    <InstallGuide />
    </>
  );
}
