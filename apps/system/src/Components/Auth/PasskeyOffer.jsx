import React, { useState } from "react";
import { rememberOffer, savePasskey, shouldOfferPasskey } from "../../utils/passkey";
import { toast } from "../../ALERT/SystemToasts";
import { getStoredUserTz } from "../../utils/session";

// Shown after signing in to an account with no passkey on this device: save one,
// so the next sign-in is a fingerprint or face. `always` keeps it on the profile page.
export default function PasskeyOffer({ always = false }) {
  const account = getStoredUserTz();
  const [state, setState] = useState(() => (always || shouldOfferPasskey(account) ? "offer" : "hidden")); // offer | busy | hidden

  if (state === "hidden") return null;

  const save = async () => {
    setState("busy");
    const r = await savePasskey(account);
    if (r.ok) {
      toast.success("تم. في المرة القادمة ادخل بالبصمة أو بالوجه.");
      return setState("hidden");
    }
    setState("offer");
    if (!r.cancelled) toast.error(r.message || "تعذّر حفظ الدخول بالبصمة على هذا الجهاز");
    return undefined;
  };
  const later = () => {
    rememberOffer(account);
    setState("hidden");
  };

  return (
    <div role="region" aria-label="الدخول بالبصمة" style={{ border: "1px solid var(--border, #d0d7de)", borderRadius: 8, padding: 12, margin: "12px 0" }}>
      <p style={{ margin: "0 0 4px" }}><strong>الدخول بالبصمة أو بالوجه</strong></p>
      <p style={{ margin: "0 0 8px" }}>ادخل في المرة القادمة بالبصمة أو بالوجه، بدون كلمة مرور. لا تحفظ على جهاز مشترك.</p>
      <button type="button" onClick={save} disabled={state === "busy"}>حفظ</button>
      {!always && <button type="button" onClick={later} disabled={state === "busy"} style={{ marginInlineStart: 8 }}>لاحقًا</button>}
    </div>
  );
}
