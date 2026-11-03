import { useState } from "react";
import { rememberOffer, savePasskey, shouldOfferPasskey } from "./passkey";

// Shown once per phone after signing in: save a passkey, so the next sign-in
// is a fingerprint or face instead of a code or the card.
export default function PasskeyOffer() {
  const [state, setState] = useState(() => (shouldOfferPasskey() ? "offer" : "hidden")); // offer | busy | done | hidden
  const [error, setError] = useState("");

  if (state === "hidden") return null;
  if (state === "done") return <p className="note passkey-offer" role="status">تم. في المرة القادمة ادخل بالبصمة أو بالوجه.</p>;

  const save = async () => {
    setState("busy");
    setError("");
    const r = await savePasskey();
    if (r.ok) return setState("done");
    setState("offer");
    if (!r.cancelled) setError(r.message || "تعذّر حفظ الدخول بالبصمة على هذا الهاتف");
  };
  const later = () => {
    rememberOffer();
    setState("hidden");
  };

  return (
    <div className="passkey-offer" role="region" aria-label="الدخول بالبصمة">
      <p>ادخل في المرة القادمة بالبصمة أو بالوجه، بدون رمز.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="passkey-offer-actions">
        <button className="btn" onClick={save} disabled={state === "busy"}>حفظ</button>
        <button className="btn btn-ghost" onClick={later} disabled={state === "busy"}>لاحقًا</button>
      </div>
    </div>
  );
}
