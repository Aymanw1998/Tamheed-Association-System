import React, { useCallback, useEffect, useState } from "react";
import { getConsent, getRules, signConsent } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
import { toast } from "../../ALERT/SystemToasts.jsx";
import Button from "../UI/Button.jsx";
import RequiredMark from "../UI/RequiredMark";
import SignaturePad from "./SignaturePad.jsx";

const when = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("en-GB");
};

// A student the association added: the parent signs here, on this device.
function SignNow({ studentId, onSigned, signerName = "" }) {
  const [rules, setRules] = useState(undefined);
  const [form, setForm] = useState({ accepted: false, signerName, signature: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getRules().then((res) => { if (alive) setRules(res.ok ? res.rules : null); });
    return () => { alive = false; };
  }, []);

  if (rules === undefined) return null;
  if (!rules?.text) return <p role="status">يجب نشر نظام الجمعية أولًا (من «رابط تسجيل الأهل») قبل التوقيع.</p>;

  const submit = async () => {
    if (!form.accepted || !form.signerName.trim() || !form.signature) {
      toast.warn("يُرجى الموافقة على النظام وكتابة اسم ولي الأمر والتوقيع");
      return;
    }
    setBusy(true);
    const res = await signConsent(studentId, { rulesVersion: rules.version, rulesAccepted: "true", signerName: form.signerName.trim(), signature: form.signature });
    setBusy(false);
    if (!res.ok) { toast.error(res.message); return; }
    toast.success("تم حفظ التوقيع");
    onSigned();
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div dir="auto" tabIndex={0} style={{ maxHeight: 200, overflowY: "auto", whiteSpace: "pre-wrap", padding: 8, border: "1px solid #d1d5db", borderRadius: 8 }}>{rules.text}</div>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <input type="checkbox" style={{ width: "auto" }} checked={form.accepted} onChange={(event) => setForm((prev) => ({ ...prev, accepted: event.target.checked }))} />
        <span>قرأ ولي الأمر نظام الجمعية ويوافق عليه<RequiredMark /></span>
      </label>
      <label htmlFor="consent-signer">اسم ولي الأمر:<RequiredMark /></label>
      <input id="consent-signer" maxLength={100} value={form.signerName} onChange={(event) => setForm((prev) => ({ ...prev, signerName: event.target.value }))} />
      <label>توقيع / ختم ولي الأمر:<RequiredMark /></label>
      <SignaturePad onChange={(signature) => setForm((prev) => ({ ...prev, signature }))} />
      <div><Button size="sm" loading={busy} onClick={submit}>حفظ التوقيع</Button></div>
    </div>
  );
}

// The signature a parent gave, with the version signed; with none, the place to sign.
export default function ConsentView({ studentId }) {
  const [state, setState] = useState({ loading: true, consent: null });

  const load = useCallback(() => {
    let alive = true;
    getConsent(studentId).then((res) => {
      if (alive) setState({ loading: false, consent: res.ok ? res.consent : null, error: res.ok ? "" : res.message });
    });
    return () => { alive = false; };
  }, [studentId]);
  useEffect(() => load(), [load]);

  if (state.loading) return <div role="status">جارٍ التحميل…</div>;
  if (state.error) return <div role="alert">{state.error}</div>;
  if (!state.consent?.signature) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <p style={{ margin: 0 }}>{state.consent
          ? `وافق ولي الأمر ${state.consent.signerName} بتاريخ ${when(state.consent.acceptedAt)}. التوقيع/الختم مطلوب ولم يُستكمل بعد.`
          : "لا يوجد توقيع لهذا الطالب. التوقيع/الختم مطلوب ويجب استكماله."}</p>
        <SignNow studentId={studentId} signerName={state.consent?.signerName} onSigned={load} />
      </div>
    );
  }
  const { signerName, signedAt, rulesVersion, rulesText, signature } = state.consent;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <p style={{ margin: 0 }}>وقّع <strong dir="auto">{signerName}</strong> بتاريخ {when(signedAt)} على الإصدار {rulesVersion}.</p>
      <img src={signature} alt="توقيع ولي الأمر" style={{ maxWidth: 320, width: "100%", background: "#fff", border: "1px solid #d1d5db", borderRadius: 8 }} />
      <details>
        <summary>النص الذي تم التوقيع عليه</summary>
        <div dir="auto" style={{ whiteSpace: "pre-wrap" }}>{rulesText}</div>
      </details>
    </div>
  );
}
