import React, { useEffect, useState } from "react";
import { submitConsentLink, validateConsentLink } from "../../WebServer/services/inviteToken/functionInviteToken";
import ConsentFields from "./ConsentFields";
import Button from "../UI/Button";
import styles from "./RegistrationConsent.module.css";

// A scoped parent link opens only this signing page, without an account or form.
export default function ParentConsentPage() {
  const [token] = useState(() => window.location.hash.slice(1));
  const [state, setState] = useState({ loading: true });
  const [form, setForm] = useState({ accepted: false, signerName: "", signature: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    let alive = true;
    validateConsentLink(token).then((result) => { if (alive) setState({ ...result, loading: false }); });
    return () => { alive = false; };
  }, [token]);
  const submit = async () => {
    if (!form.accepted || !form.signerName.trim() || !form.signature) {
      setError("يجب الموافقة على قوانين الجمعية وكتابة اسم ولي الأمر والتوقيع قبل الإرسال."); return;
    }
    setBusy(true); setError("");
    const result = await submitConsentLink(token, { rulesVersion: state.rules.version, rulesAccepted: "true", signerName: form.signerName.trim(), signature: form.signature });
    setBusy(false);
    if (result.ok) { setSent(true); return; }
    setError(result.message);
    if (result.code === "RULES_CHANGED") {
      const fresh = await validateConsentLink(token);
      setState({ ...fresh, loading: false });
      setForm((previous) => ({ ...previous, accepted: false, signature: "" }));
    } else if (result.code === "LINK_CLOSED") setState({ ok: false, message: result.message });
  };
  return <main className={styles.page} dir="rtl">
    <h1>قوانين الجمعية</h1>
    {state.loading ? <p role="status">جارٍ التحميل…</p> : sent ? <p role="status">تم حفظ موافقتكم وتوقيعكم في ملف الطالب. شكرًا لكم.</p> : !state.ok ? <p role="alert">{state.message || "الرابط غير صالح. اطلب رابطًا جديدًا من الجمعية."}</p> : <>
      <p>للطالب: <strong dir="auto">{state.studentName}</strong></p>
      <ConsentFields key={state.rules.version} rules={state.rules} value={form} onChange={setForm} disabled={busy} />
      {error && <p role="alert">{error}</p>}
      <Button loading={busy} onClick={submit}>إرسال الموافقة والتوقيع</Button>
    </>}
  </main>;
}
