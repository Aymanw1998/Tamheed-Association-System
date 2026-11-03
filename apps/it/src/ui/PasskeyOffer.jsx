import { useState } from "react";
import { rememberOffer, savePasskey, shouldOfferPasskey } from "../passkey";
import { toast } from "./toast.jsx";

// Shown once per device after signing in: save a passkey, so the next
// sign-in is a fingerprint or face instead of the password and the code.
export default function PasskeyOffer() {
  const [state, setState] = useState(() => (shouldOfferPasskey() ? "offer" : "hidden")); // offer | busy | hidden

  if (state === "hidden") return null;

  const save = async () => {
    setState("busy");
    const r = await savePasskey();
    if (r.ok) {
      toast.success("تم. في المرة القادمة ادخل بالبصمة أو بالوجه.");
      return setState("hidden");
    }
    setState("offer");
    if (!r.cancelled) toast.error(r.message || "تعذّر حفظ الدخول بالبصمة على هذا الجهاز");
  };
  const later = () => {
    rememberOffer();
    setState("hidden");
  };

  return (
    <div className="card passkey-offer" role="region" aria-label="الدخول بالبصمة">
      <p><strong>الدخول بالبصمة أو بالوجه</strong></p>
      <p className="muted">ادخل في المرة القادمة بالبصمة أو بالوجه، بدون كلمة مرور وبدون رمز.</p>
      <div className="row">
        <button type="button" className="primary" onClick={save} disabled={state === "busy"}>حفظ</button>
        <button type="button" onClick={later} disabled={state === "busy"}>لاحقًا</button>
      </div>
    </div>
  );
}
