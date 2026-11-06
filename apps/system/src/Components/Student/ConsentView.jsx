import React, { useCallback, useEffect, useRef, useState } from "react";
import { createConsentLink, getConsent, getRules, signConsent } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";
import { toast } from "../../ALERT/SystemToasts.jsx";
import Button from "../UI/Button.jsx";
import RegistrationConsent from "./RegistrationConsent";

const when = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("en-GB");
};

export default function ConsentView({ studentId }) {
  const [state, setState] = useState({ loading: true, consent: null, rules: null });
  const [form, setForm] = useState({ accepted: false, signerName: "", signature: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const request = useRef(0);
  const load = useCallback(async () => {
    const ticket = ++request.current;
    const [consent, rules] = await Promise.all([getConsent(studentId), getRules()]);
    if (ticket !== request.current) return;
    setState({ loading: false, consent: consent.ok ? consent.consent : null, rules: rules.ok ? rules.rules : null, error: !consent.ok ? consent.message : !rules.ok ? rules.message : "" });
    setForm({ accepted: false, signerName: consent.consent?.signerName || "", signature: "" });
  }, [studentId]);
  useEffect(() => { setLink(null); setState({ loading: true }); load(); return () => { request.current += 1; }; }, [load]);

  const submit = async () => {
    if (!form.accepted || !form.signerName.trim() || !form.signature) {
      setError("يجب الموافقة على قوانين الجمعية وكتابة اسم ولي الأمر والتوقيع قبل الإرسال.");
      return false;
    }
    setBusy(true); setError("");
    const res = await signConsent(studentId, { rulesVersion: state.rules.version, rulesAccepted: "true", signerName: form.signerName.trim(), signature: form.signature, ...(state.consent?.revision ? { baseConsentVersion: state.consent.revision } : {}) });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      if (res.code === "RULES_CHANGED" || res.code === "CONSENT_CHANGED") await load();
      return false;
    }
    toast.success("تم حفظ التوقيع"); setLink(null); await load();
    return true;
  };
  const makeLink = async () => {
    setLinkBusy(true);
    const result = await createConsentLink(studentId);
    setLinkBusy(false);
    if (!result.ok) { toast.error(result.message); return; }
    setLink({ url: `${window.location.origin}/parent-consent#${result.token}`, expiresAt: result.expiresAt });
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(link.url); toast.success("تم نسخ الرابط"); }
    catch { toast.warn("تعذّر النسخ، انسخ الرابط من الحقل."); }
  };
  const shareLink = async () => {
    try { await navigator.share({ title: "قوانين الجمعية والتوقيع", text: "يُرجى قراءة قوانين الجمعية والموافقة والتوقيع.", url: link.url }); }
    catch (reason) { if (reason?.name !== "AbortError") toast.warn("تعذّرت المشاركة، يمكنك نسخ الرابط."); }
  };
  if (state.loading) return <p role="status">جارٍ التحميل…</p>;
  if (state.error) return <p role="alert">{state.error}</p>;
  const consent = state.consent;
  return <div style={{ display: "grid", gap: 12 }}>
    {consent?.signature ? <>
      <p>وقّع <strong dir="auto">{consent.signerName}</strong> بتاريخ {when(consent.signedAt)} على الإصدار {consent.rulesVersion}.</p>
      <img src={consent.signature} alt="توقيع ولي الأمر" style={{ width: "100%", maxWidth: 320, background: "#fff", border: "1px solid #d1d5db", borderRadius: 8 }} />
      <details><summary>النص الذي تم التوقيع عليه</summary><div dir="auto" style={{ whiteSpace: "pre-wrap" }}>{consent.rulesText}</div></details>
    </> : <p>متبقٍ توقيع ولي الأمر{consent?.acceptedAt ? ` — تمت الموافقة بتاريخ ${when(consent.acceptedAt)}، ولم يُستكمل التوقيع بعد.` : ""}</p>}
    {state.rules?.text ? <>
      <RegistrationConsent key={`${state.rules.version}:${consent?.revision || "none"}`} rules={state.rules} value={form} onChange={setForm} nameId="consent-signer" onConfirm={submit} busy={busy} error={error} linkLabel={consent?.signature ? "تحديث التوقيع" : "قوانين الجمعية والتوقيع"} confirmLabel="حفظ التوقيع" />
      <div><Button size="sm" loading={linkBusy} onClick={makeLink}>إنشاء رابط لولي الأمر</Button></div>
    </> : <p>التوقيع غير متاح حتى تنشر الإدارة قوانين الجمعية.</p>}
    {link && <section aria-label="رابط توقيع ولي الأمر" style={{ display: "grid", gap: 8 }}>
      <input readOnly dir="ltr" aria-label="رابط التوقيع" value={link.url} onFocus={(event) => event.target.select()} />
      <small>الرابط مخصص لقوانين هذا الطالب وتوقيعها فقط، صالح حتى {when(link.expiresAt)} وينتهي بعد الإرسال.</small>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><Button size="sm" onClick={copyLink}>نسخ الرابط</Button>{typeof navigator.share === "function" && <Button size="sm" onClick={shareLink}>مشاركة الرابط</Button>}</div>
    </section>}
  </div>;
}
