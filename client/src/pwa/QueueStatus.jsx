import React, { useCallback, useEffect, useState } from "react";
import { getStoredUserTz } from "../utils/session";
import { ask } from "../Components/Provides/confirmBus";
import {
  OVERWRITTEN_MESSAGE, QUEUE_CHANGED_EVENT, clearOthers, failedItems, othersPending, pending, retryFailed,
} from "./attendanceQueue";
import { flushCurrentUser } from "./queuedSave";

export const SIGNED_IN_EVENT = "tamheed:signed-in";

const box = {
  position: "fixed",
  insetInlineStart: 12,
  bottom: 48,
  zIndex: 9400,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  maxWidth: "min(92vw, 360px)",
  fontSize: 14,
  lineHeight: 1.5,
};
const card = { background: "#fff", color: "#1b2b34", border: "1px solid #1e6580", borderRadius: 8, padding: "6px 10px" };
const btn = { font: "inherit", color: "#fff", background: "#1e6580", border: 0, borderRadius: 6, padding: "2px 10px", cursor: "pointer" };

// Shows what is waiting to be sent for the signed-in user, and sends it on
// start, when the connection returns and after sign-in.
export default function QueueStatus() {
  const [count, setCount] = useState(0);
  const [failed, setFailed] = useState([]);
  const [others, setOthers] = useState(0);
  const [overwritten, setOverwritten] = useState(false);

  const refresh = useCallback(async () => {
    const tz = getStoredUserTz();
    try {
      if (!tz || localStorage.getItem("isLoggedIn") !== "1") {
        setCount(0); setFailed([]); setOthers(0);
        return;
      }
      const [all, bad, other] = await Promise.all([pending(tz), failedItems(tz), othersPending(tz)]);
      setCount(all.filter((r) => !r.failed).length);
      setFailed(bad);
      setOthers(other);
    } catch {}
  }, []);

  const sync = useCallback(async () => {
    const res = await flushCurrentUser();
    if (res?.overwritten?.length) setOverwritten(true);
    refresh();
  }, [refresh]);

  useEffect(() => {
    sync();
    window.addEventListener("online", sync);
    window.addEventListener(SIGNED_IN_EVENT, sync);
    window.addEventListener(QUEUE_CHANGED_EVENT, refresh);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener(SIGNED_IN_EVENT, sync);
      window.removeEventListener(QUEUE_CHANGED_EVENT, refresh);
    };
  }, [sync, refresh]);

  const retry = async () => {
    try { await retryFailed(getStoredUserTz()); } catch {}
    sync();
  };

  const dropOthers = async () => {
    const ok = await ask({
      title: "حذف الحضور المعلّق",
      message: "سيُحذف الحضور المعلّق لمستخدم آخر على هذا الجهاز ولن يُرسل. هل تريد المتابعة؟",
      confirmText: "حذف",
      cancelText: "إلغاء",
      danger: true,
    }).catch(() => false);
    if (!ok) return;
    try { await clearOthers(getStoredUserTz()); } catch {}
    refresh();
  };

  if (!count && !failed.length && !others && !overwritten) return null;

  return (
    <div dir="rtl" style={box} data-testid="queue-status">
      {count > 0 && <div role="status" style={card}>بانتظار الإرسال: {count}</div>}
      {failed.length > 0 && (
        <div role="alert" style={card}>
          {failed.map((r) => (
            <div key={r.id}>{r.label || "حضور"}: {r.message}</div>
          ))}
          <button type="button" style={btn} onClick={retry}>إعادة المحاولة</button>
        </div>
      )}
      {others > 0 && (
        <div role="status" style={card}>
          يوجد حضور معلّق لمستخدم آخر على هذا الجهاز{" "}
          <button type="button" style={btn} onClick={dropOthers}>حذف</button>
        </div>
      )}
      {overwritten && (
        <div role="status" style={card}>
          {OVERWRITTEN_MESSAGE}{" "}
          <button type="button" style={btn} onClick={() => setOverwritten(false)} aria-label="إغلاق">×</button>
        </div>
      )}
    </div>
  );
}
