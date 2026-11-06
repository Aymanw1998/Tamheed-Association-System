import React, { useEffect, useRef, useState } from "react";
import ConsentFields from "./ConsentFields";
import styles from "./RegistrationConsent.module.css";

// Parents must agree and sign before sending; closing only keeps a local draft.
export default function RegistrationConsent({ rules, value, onChange, onConfirm, busy = false, error = "", nameId, linkLabel = "قوانين الجمعية", confirmLabel = "حفظ والعودة إلى الطلب" }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef(null);
  const link = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector("button")?.focus();
    return () => { document.body.style.overflow = previousOverflow; link.current?.focus(); };
  }, [open]);
  const onKeyDown = (event) => {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialog.current.querySelectorAll("button:not(:disabled), input:not(:disabled), [tabindex='0']"));
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return (
    <section className={styles.section} aria-label="الموافقة على قوانين الجمعية">
      <button type="button" ref={link} className={styles.link} onClick={() => setOpen(true)}>{linkLabel}</button>
      <p role="status">{value.accepted
        ? value.signature ? "تمت الموافقة وإضافة التوقيع/الختم." : "التوقيع/الختم مطلوب قبل الإرسال."
        : "يجب قراءة القوانين والموافقة عليها قبل إرسال الطلب."}</p>
      {open && (
        <div className={styles.overlay} onClick={() => setOpen(false)}>
          <div className={styles.dialog} ref={dialog} role="dialog" aria-modal="true" aria-labelledby="registration-rules-title" dir="rtl" onClick={(event) => event.stopPropagation()} onKeyDown={onKeyDown}>
            <div className={styles.heading}>
              <h2 id="registration-rules-title">قوانين الجمعية</h2>
              <button type="button" aria-label="إغلاق قوانين الجمعية" onClick={() => setOpen(false)}>×</button>
            </div>
            <ConsentFields rules={rules} value={value} onChange={onChange} disabled={busy} nameId={nameId} />
            {error && <p role="alert">{error}</p>}
            <button type="button" disabled={busy} onClick={async () => { if (!onConfirm || await onConfirm()) setOpen(false); }}>{busy ? "جارٍ الحفظ…" : confirmLabel}</button>
          </div>
        </div>
      )}
    </section>
  );
}
