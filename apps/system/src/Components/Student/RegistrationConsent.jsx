import React, { useEffect, useRef, useState } from "react";
import SignaturePad from "./SignaturePad";
import styles from "./RegistrationConsent.module.css";

// Agreement is required now; the stamp stays visibly pending until completed.
export default function RegistrationConsent({ rules, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [drawing, setDrawing] = useState(true);
  const dialog = useRef(null);
  const link = useRef(null);
  const change = (patch) => onChange((previous) => ({ ...previous, ...patch }));
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
    const controls = Array.from(dialog.current.querySelectorAll("button:not(:disabled), input, [tabindex='0']"));
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return (
    <section className={styles.section} aria-label="الموافقة على قوانين الجمعية">
      <button type="button" ref={link} className={styles.link} onClick={() => { setDrawing(!value.signature); setOpen(true); }}>قوانين الجمعية</button>
      <p role="status">{value.accepted
        ? value.signature ? "تمت الموافقة وإضافة التوقيع/الختم." : "تمت الموافقة. التوقيع/الختم مطلوب ويجب استكماله لاحقًا."
        : "يجب قراءة القوانين والموافقة عليها قبل إرسال الطلب."}</p>
      {open && (
        <div className={styles.overlay} onClick={() => setOpen(false)}>
          <div className={styles.dialog} ref={dialog} role="dialog" aria-modal="true" aria-labelledby="registration-rules-title" dir="rtl" onClick={(event) => event.stopPropagation()} onKeyDown={onKeyDown}>
            <div className={styles.heading}>
              <h2 id="registration-rules-title">قوانين الجمعية</h2>
              <button type="button" aria-label="إغلاق قوانين الجمعية" onClick={() => setOpen(false)}>×</button>
            </div>
            <div className={styles.rules} dir="auto" tabIndex={0}>{rules.text}</div>
            <label htmlFor="signer-name">اسم ولي الأمر (مطلوب)</label>
            <input id="signer-name" name="signerName" maxLength={100} value={value.signerName} onChange={(event) => change({ signerName: event.target.value })} />
            <div className={styles.actions}>
              <button type="button" aria-pressed={value.accepted} onClick={() => change({ accepted: true })}>أوافق على القوانين</button>
              <button type="button" aria-pressed={!value.accepted} onClick={() => change({ accepted: false })}>لا أوافق</button>
            </div>
            <label>توقيع / ختم ولي الأمر</label>
            <small>ارسم التوقيع أو الختم في اللوحة. يمكن إرسال الطلب بعد الموافقة والاسم، واستكمال التوقيع/الختم لاحقًا لدى الجمعية.</small>
            {!drawing && value.signature ? (
              <div>
                <img className={styles.signature} src={value.signature} alt="توقيع/ختم ولي الأمر" />
                <button type="button" onClick={() => { change({ signature: "" }); setDrawing(true); }}>إعادة التوقيع/الختم</button>
              </div>
            ) : <SignaturePad onChange={(signature) => change({ signature })} />}
            <button type="button" onClick={() => setOpen(false)}>حفظ والعودة إلى الطلب</button>
          </div>
        </div>
      )}
    </section>
  );
}
