import React, { useEffect, useRef, useState } from "react";
import { StaleNotice } from "./staleSave";

export const LOCK_LOST_MESSAGES = {
  forced: "حرّر المدير القفل. التعديلات غير المحفوظة ما زالت ظاهرة.",
  expired: "انتهت مدة القفل بسبب انقطاع الاتصال.",
  idle: "حُرّر القفل بسبب عدم النشاط.",
};
const KEPT_MESSAGE = "تم تحميل أحدث نسخة. نصّك محفوظ أدناه لتنسخه.";

const bar = {
  background: "#fff7ed",
  color: "#7c2d12",
  border: "1px solid #fdba74",
  borderRadius: 8,
  padding: "8px 12px",
  margin: "8px 0",
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
};

// The banner of a screen whose lock was lost (useItemLock status "readonly").
export default function LockLostBanner({ reason, onRestore, busy = false }) {
  const text = LOCK_LOST_MESSAGES[reason];
  if (!text) return null;
  return (
    <div role="alert" style={bar}>
      <span>{text}</span>
      <button type="button" onClick={onRestore} disabled={busy}>استعادة التحرير</button>
    </div>
  );
}

// Keeps the lost-lock banner and its recovery across the screen's loading
// view: «استعادة التحرير» calls lock.retry(); once the lock is held again the
// item's latest version is reloaded and the draft typed before stays visible
// (read-only, with «نسخ») so nothing is lost. Render `element` on the screen.
export function useLockRecovery(lock, { reload, draft = "" } = {}) {
  const [kept, setKept] = useState(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(null);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    if (pending.current === null) return;
    if (lock.status === "held") {
      const saved = pending.current;
      pending.current = null;
      setBusy(false);
      setKept(saved);
      reloadRef.current?.();
    } else if (lock.status === "readonly") {
      // The retry did not get the lock back; the banner shows again.
      pending.current = null;
      setBusy(false);
    }
  }, [lock.status]);

  const restore = () => {
    pending.current = String(draft ?? "");
    setBusy(true);
    lock.retry?.();
  };

  let element = null;
  if (lock.status === "readonly" && LOCK_LOST_MESSAGES[lock.reason]) {
    element = <LockLostBanner reason={lock.reason} onRestore={restore} busy={busy} />;
  } else if (kept !== null && kept !== "") {
    element = <StaleNotice message={KEPT_MESSAGE} draft={kept} />;
  }
  return { element };
}
