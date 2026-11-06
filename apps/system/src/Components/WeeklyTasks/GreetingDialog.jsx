import React, { useRef, useState } from "react";
import { sendGreeting } from "../../WebServer/services/weeklyTasks/functionsWeeklyTasks.jsx";
import Button from "../UI/Button";
import "../Provides/ConfirmContext.css";
import styles from "./WeeklyTasks.module.css";

export const DEFAULT_GREETING = "بارك الله فيكم على مجهودكم";
const requestId = () => globalThis.crypto?.randomUUID?.() || `greeting_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const mailLabel = { sent: "أُرسل البريد", missing: "لا يوجد بريد شخصي", failed: "تعذّر إرسال البريد", pending: "الإرسال قيد المعالجة؛ حاول التحقق مجددًا" };

export default function GreetingDialog({ guides, defaultText = DEFAULT_GREETING, onClose }) {
  const [text, setText] = useState(defaultText);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deliveries, setDeliveries] = useState(null);
  const request = useRef(requestId());
  const submitting = useRef(false);
  const change = (fn) => { request.current = requestId(); setDeliveries(null); setError(""); fn(); };
  const submit = async () => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true); setError("");
    const result = await sendGreeting({ text: text.trim(), guideIds: selected, requestId: request.current });
    setBusy(false); submitting.current = false;
    if (!result.ok) { setError(result.message); return; }
    setDeliveries(result.deliveries || []);
  };
  return (
    <div className="c-overlay" role="dialog" aria-modal="true" aria-labelledby="greeting-title" dir="rtl">
      <div className="c-dialog">
        <div className="c-header"><h3 id="greeting-title">إرسال بركة للمسؤولين</h3></div>
        <div className="c-body" style={{ maxHeight: "65vh", overflowY: "auto" }}>
          <p>تصل البركة للمختارين في التنبيهات وبريدهم الشخصي إن وُجد، حتى لو لم ينهوا المهمات بعد.</p>
          <fieldset disabled={busy || Boolean(deliveries)} className={styles.form}>
            <legend>المستلمون</legend>
            <button type="button" onClick={() => change(() => setSelected(guides.map((guide) => guide.id)))}>اختيار الجميع</button>
            {guides.map((guide) => (
              <label key={guide.id} className={styles.recipient}>
                <input type="checkbox" checked={selected.includes(guide.id)} onChange={() => change(() => setSelected((list) => list.includes(guide.id) ? list.filter((id) => id !== guide.id) : [...list, guide.id]))} />
                <span dir="auto">{guide.name}</span>
              </label>
            ))}
            <label htmlFor="weekly-greeting-text">نص البركة</label>
            <textarea id="weekly-greeting-text" rows={4} maxLength={500} value={text} onChange={(event) => change(() => setText(event.target.value))} />
          </fieldset>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          {deliveries && <div role="status">
            {deliveries.map((delivery) => <p key={delivery.guideId}>
              {guides.find((guide) => guide.id === delivery.guideId)?.name}: {delivery.notified ? "وصل التنبيه" : "لم يُؤكد وصول التنبيه"} — {mailLabel[delivery.email]}
            </p>)}
          </div>}
        </div>
        <div className="c-actions">
          <Button variant="secondary" disabled={busy} onClick={onClose}>إغلاق</Button>
          {!deliveries && <Button loading={busy} disabled={!selected.length || !text.trim()} onClick={submit}>إرسال</Button>}
          {deliveries?.some((delivery) => delivery.email === "pending") && <Button loading={busy} onClick={submit}>التحقق من الإرسال</Button>}
        </div>
      </div>
    </div>
  );
}
