import React, { useEffect } from "react";
import "./dialog.css";

// A yes/no window (the same look as the filter window). `message` may be text or elements.
export default function ConfirmDialog({ title, message, confirmText = "تأكيد", cancelText = "إلغاء", danger = false, onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="c-overlay" onClick={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className="c-dialog" role="dialog" aria-modal="true" aria-label={title} dir="rtl">
        <div className="c-header"><h3>{title}</h3></div>
        <div className="c-body">{message}</div>
        <div className="c-actions">
          <button type="button" className="c-btn" onClick={onCancel}>{cancelText}</button>
          <button type="button" className={`c-btn ${danger ? "c-btn-danger" : "c-btn-primary"}`} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}
