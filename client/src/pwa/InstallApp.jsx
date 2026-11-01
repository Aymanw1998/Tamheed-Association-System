import React, { useEffect, useState } from "react";
import {
  canPromptInstall, installPlatform, isPhone, onInstallGuide, openInstallGuide, promptInstall, subscribeInstall,
} from "./installState";

// "Install the app" on a phone, for people who do not know how (owner,
// 2026-11-01): one tap where the browser can install (Android), otherwise a
// guide with the steps for this phone. The same file is in sport/src/pwa.

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" style={{ verticalAlign: "middle" }}>
    <path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke="#0a84ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" fill="none" stroke="#0a84ff" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const AddIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" style={{ verticalAlign: "middle" }}>
    <rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="#111" strokeWidth="2" />
    <path d="M12 8v8M8 12h8" stroke="#111" strokeWidth="2" strokeLinecap="round" />
  </svg>
);
const Key = ({ children }) => (
  <b style={{ background: "#eef2f7", borderRadius: 6, padding: "0 6px", whiteSpace: "nowrap" }}>{children}</b>
);

function steps(platform) {
  if (platform === "ios-safari") {
    return [
      <>اضغط زر <Key>مشاركة <ShareIcon /></Key> في أسفل الشاشة.</>,
      <>مرّر للأسفل واختر <Key>إضافة إلى الشاشة الرئيسية <AddIcon /></Key>.</>,
      <>اضغط <Key>إضافة</Key> في الأعلى، ثم افتح التطبيق من أيقونته على الشاشة.</>,
    ];
  }
  if (platform === "ios-other") {
    return [
      <>اضغط زر <Key>مشاركة <ShareIcon /></Key> بجانب العنوان في الأعلى.</>,
      <>اختر <Key>إضافة إلى الشاشة الرئيسية <AddIcon /></Key>. إن لم يظهر، افتح الرابط في Safari وكرّر.</>,
      <>اضغط <Key>إضافة</Key>، ثم افتح التطبيق من أيقونته على الشاشة.</>,
    ];
  }
  return [
    <>اضغط القائمة <Key>⋮</Key> في أعلى المتصفح.</>,
    <>اختر <Key>تثبيت التطبيق</Key> أو <Key>إضافة إلى الشاشة الرئيسية</Key>.</>,
    <>اضغط <Key>تثبيت</Key>، ثم افتح التطبيق من أيقونته على الشاشة.</>,
  ];
}

// Only on a phone where the app is not installed yet.
export function InstallAppButton({ platform = installPlatform(), className = "", style }) {
  if (!isPhone(platform)) return null;
  const onClick = async () => {
    if (platform === "android" && canPromptInstall()) {
      const outcome = await promptInstall();
      if (outcome !== "unavailable") return;
    }
    openInstallGuide();
  };
  return (
    <button type="button" className={className} style={style} onClick={onClick} data-testid="install-app">
      📲 ثبّت التطبيق على الهاتف
    </button>
  );
}

const backdrop = {
  position: "fixed", inset: 0, zIndex: 9600, display: "flex", alignItems: "flex-end", justifyContent: "center",
  background: "rgba(15, 23, 42, 0.55)", padding: 12,
};
const sheet = {
  width: "100%", maxWidth: 420, background: "#fff", color: "#0f172a", borderRadius: 18, padding: "18px 18px 14px",
  boxShadow: "0 10px 30px rgba(0,0,0,.25)", fontSize: 15, lineHeight: 1.7,
};
const primary = {
  font: "inherit", fontWeight: 700, width: "100%", border: 0, borderRadius: 10, padding: "10px 12px",
  background: "#1e6580", color: "#fff", cursor: "pointer", marginBottom: 8,
};
const secondary = { ...primary, background: "#eef2f7", color: "#0f172a", marginBottom: 0 };

// Mounted once (in AppChrome); opened by any InstallAppButton.
export function InstallGuide({ platform = installPlatform() }) {
  const [open, setOpen] = useState(false);
  const [canPrompt, setCanPrompt] = useState(canPromptInstall);
  useEffect(() => onInstallGuide(() => setOpen(true)), []);
  useEffect(() => subscribeInstall(() => setCanPrompt(canPromptInstall())), []);
  if (!open) return null;

  const close = () => setOpen(false);
  const installNow = async () => {
    const outcome = await promptInstall();
    if (outcome === "accepted") close();
  };

  return (
    <div style={backdrop} onClick={close} dir="rtl">
      <div style={sheet} role="dialog" aria-modal="true" aria-label="تثبيت التطبيق" data-testid="install-guide" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>📲 تثبيت التطبيق على الهاتف</h2>
        <p style={{ margin: "0 0 8px", color: "#475569" }}>يفتح بنقرة من الشاشة الرئيسية، بملء الشاشة، ومع الإشعارات.</p>
        {platform === "android" && canPrompt && (
          <button type="button" style={primary} onClick={installNow}>تثبيت الآن</button>
        )}
        <ol style={{ margin: "0 0 12px", paddingInlineStart: 22 }}>
          {steps(platform).map((step, i) => <li key={i} style={{ marginBottom: 6 }}>{step}</li>)}
        </ol>
        <button type="button" style={secondary} onClick={close} data-testid="install-guide-close">إغلاق</button>
      </div>
    </div>
  );
}
