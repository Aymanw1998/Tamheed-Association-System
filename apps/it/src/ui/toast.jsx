import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./Toast.module.css";

// Short messages at the top of the screen, like the everyday app's
// (apps/system/src/ALERT/SystemToasts.jsx): toast.success("تم الحفظ"),
// toast.error(text). <Toaster /> (once, in App) shows them.
const DURATION = { success: 5000, info: 5000, warning: 7000, destructive: 8000 };

let items = [];
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(items));
let nextId = 1;

const push = (variant) => (description) => {
  if (!description) return;
  items = [{ id: nextId++, variant, description }, ...items];
  emit();
};

export const toast = {
  success: push("success"),
  info: push("info"),
  warn: push("warning"),
  error: push("destructive"),
};

export const dismissToast = (id) => {
  items = items.filter((t) => t.id !== id);
  emit();
};

// For tests: drop every message.
export const clearToasts = () => {
  items = [];
  emit();
};

export function Toaster() {
  const [list, setList] = useState(items);
  useEffect(() => {
    listeners.add(setList);
    setList(items);
    return () => listeners.delete(setList);
  }, []);
  return createPortal(
    <div className={styles.viewport}>
      <div className={styles.stack}>
        {list.map((t) => <ToastItem key={t.id} t={t} onClose={() => dismissToast(t.id)} />)}
      </div>
    </div>,
    document.body,
  );
}

// Closes by itself; the countdown stops while the pointer is over it.
function ToastItem({ t, onClose }) {
  const total = DURATION[t.variant] || 5000;
  const [left, setLeft] = useState(total);
  const [hover, setHover] = useState(false);
  const leftRef = useRef(total);

  useEffect(() => {
    if (hover) return undefined;
    const endAt = Date.now() + leftRef.current;
    const id = setInterval(() => {
      const remaining = endAt - Date.now();
      leftRef.current = Math.max(0, remaining);
      setLeft(leftRef.current);
      if (remaining <= 0) { clearInterval(id); onClose(); }
    }, 100);
    return () => clearInterval(id);
  }, [hover, onClose]);

  const pct = Math.round((left / total) * 100);
  const isError = t.variant === "destructive";
  return (
    <div
      className={`${styles.toast} ${styles[t.variant]}`}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className={styles.row}>
        <div className={styles.desc}>{t.description}</div>
        <div className={styles.timer} aria-hidden="true">{Math.ceil(left / 1000)}s</div>
        <button type="button" onClick={onClose} aria-label="إغلاق" className={styles.close}>×</button>
      </div>
      <div className={styles.bar} aria-hidden="true">
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
