import React, { useEffect, useState } from "react";
import { getConsent } from "../../WebServer/services/inviteToken/functionInviteToken.jsx";

const when = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("en-GB");
};

// The signature a parent gave on the registration link, with the version signed.
export default function ConsentView({ studentId }) {
  const [state, setState] = useState({ loading: true, consent: null });

  useEffect(() => {
    let alive = true;
    getConsent(studentId).then((res) => {
      if (alive) setState({ loading: false, consent: res.ok ? res.consent : null, error: res.ok ? "" : res.message });
    });
    return () => { alive = false; };
  }, [studentId]);

  if (state.loading) return <div role="status">جارٍ التحميل…</div>;
  if (state.error) return <div role="alert">{state.error}</div>;
  if (!state.consent) return <p>لا يوجد توقيع لهذا الطالب.</p>;
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
