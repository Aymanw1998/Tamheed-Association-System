import React, { useEffect, useState } from "react";
import "../Provides/ConfirmContext.css";
import styles from "./FilterDialog.module.css";

// A list's filters, in a window opened by a «فلتر» button (owner, 2026-11-03:
// on every screen). The button counts the active filters, and «مسح الفلتر»
// beside it clears them without opening the window. Filters apply as they
// change; with `onApply` the window is a form instead, applied by «تطبيق».
// `tour`, `clearTour`, `closeTour` and `applyTour` name the buttons for the
// guided journey. `label` renames the button and window for other content
// («معلومات التخزين»); `defaultOpen` opens it on arrival.
//   <FilterDialog count={n} onClear={reset} tour="users-status-filter">…</FilterDialog>
export default function FilterDialog({ label = "فلتر", defaultOpen = false, count = 0, onClear, onApply, applying = false, tour, clearTour, closeTour, applyTour, children }) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const submit = (event) => {
    event.preventDefault();
    onApply(event);
    setOpen(false);
  };
  const Body = onApply ? "form" : "div";

  return (
    <div className={styles.bar}>
      <button type="button" className={styles.open} data-tour={tour} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {label}
        {count > 0 && <span className={styles.count}>{count}</span>}
      </button>
      {onClear && count > 0 && (
        <button type="button" className={styles.clear} data-tour={clearTour} onClick={onClear}>مسح الفلتر</button>
      )}
      {open && (
        <div className="c-overlay" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <Body className="c-dialog" role="dialog" aria-modal="true" aria-labelledby="filter-dialog-title" dir="rtl" onSubmit={onApply ? submit : undefined}>
            <div className="c-header"><h3 id="filter-dialog-title">{label}</h3></div>
            <div className={`c-body ${styles.fields}`}>{children}</div>
            <div className="c-actions">
              {onClear && <button type="button" className="c-btn" onClick={onClear}>مسح الفلتر</button>}
              <button type="button" className="c-btn" data-tour={closeTour} onClick={() => setOpen(false)}>إغلاق</button>
              {onApply && <button type="submit" className="c-btn c-btn-primary" data-tour={applyTour} disabled={applying}>تطبيق</button>}
            </div>
          </Body>
        </div>
      )}
    </div>
  );
}
