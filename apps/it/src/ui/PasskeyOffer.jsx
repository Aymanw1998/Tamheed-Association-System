import { useState } from "react";
import { rememberOffer, savePasskey, shouldOfferPasskey } from "../passkey";
import { toast } from "./toast.jsx";

// Shown after signing in to an account with no passkey on this device: save one, so
// the next sign-in is a fingerprint or face instead of the password and the code.
export default function PasskeyOffer({ account }) {
  const [state, setState] = useState(() => (shouldOfferPasskey(account) ? "offer" : "hidden")); // offer | busy | hidden

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
  };
  const later = () => {
    rememberOffer(account);
    setState("hidden");
  };

  return (
    <div className="card passkey-offer" role="region" aria-label="الدخول بالبصمة">
      <p><strong>الدخول بالبصمة أو بالوجه</strong></p>
      <p className="muted">ادخل في المرة القادمة بالبصمة أو بالوجه، بدون كلمة مرور وبدون رمز. لا تحفظ على جهاز مشترك.</p>
      <div className="row">
        <button type="button" className="primary" onClick={save} disabled={state === "busy"}>حفظ</button>
        <button type="button" onClick={later} disabled={state === "busy"}>لاحقًا</button>
      </div>
    </div>
  );
}
