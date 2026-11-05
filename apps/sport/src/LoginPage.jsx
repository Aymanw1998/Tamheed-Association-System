import RequiredMark from "./RequiredMark";
import { useEffect, useState } from "react";
import { requestCode, verifyCode, GENERIC_ERROR_MESSAGE } from "./api.js";
import { clearApiCache } from "./pwa/clearApiCache";
import logo from "./logo.png";
import { Ball, Floodlight } from "./Art.jsx";
import { newSignIn, passkeySupported, signInWithPasskey } from "./passkey";
import { InstallAppButton } from "./pwa/InstallApp";

const digits = (v, max) => v.replace(/\D/g, "").slice(0, max);
const GENERIC_ERROR = GENERIC_ERROR_MESSAGE;

// notice: why a sign-in card did not work, shown above the form.
export default function LoginPage({ onSignedIn, notice = "" }) {
  // This page shows only when signed out: what follows is a new sign-in.
  useEffect(() => { newSignIn(); }, []);
  const [step, setStep] = useState("tz");
  const [tz, setTz] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canPasskey = passkeySupported();

  // A passkey saved on this phone: a fingerprint or face, no ID number.
  const withPasskey = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await signInWithPasskey();
      if (r.ok) {
        await clearApiCache();
        return onSignedIn();
      }
      if (!r.cancelled) setError(r.message || "تعذّر الدخول بالبصمة. ادخل بالرمز أو بالبطاقة");
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const send = async (e) => {
    e.preventDefault();
    if (tz.length < 5 || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await requestCode(tz);
      if (r.ok) {
        setMessage(r.data?.message || "");
        setStep("code");
      } else {
        setError(r.data?.message || GENERIC_ERROR);
      }
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e.preventDefault();
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await verifyCode(tz, code);
      if (r.ok) {
        await clearApiCache();
        return onSignedIn();
      }
      setError(r.data?.message || GENERIC_ERROR);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-hero" aria-hidden="true">
        <Floodlight className="mast mast-r" />
        <Floodlight className="mast mast-l" />
        <span className="beam beam-r" />
        <span className="beam beam-l" />
      </div>
      <div className="login-inner">
        <span className="logo-badge login-logo">
          <img src={logo} alt="شعار جمعية تمهيد" />
        </span>
        <h1>تمهيد - رياضة</h1>
        <p className="login-sub">بوابة اللاعبين</p>
        <div className="login-panel">
          {notice && <p className="error" role="alert">{notice}</p>}
          {step === "tz" && canPasskey && (
            <>
              <button type="button" className="btn btn-passkey" onClick={withPasskey} disabled={busy}>الدخول بالبصمة أو بالوجه</button>
              <p className="login-or">أو برقم الهوية</p>
            </>
          )}
          {step === "tz" ? (
            <form onSubmit={send} className="login-form">
              <label htmlFor="tz">رقم الهوية<RequiredMark /></label>
              <input
                id="tz"
                inputMode="numeric"
                autoComplete="off"
                value={tz}
                onChange={(e) => setTz(digits(e.target.value, 9))}
              />
              <button className="btn" disabled={busy || tz.length < 5}>أرسل الرمز</button>
              <p className="note">بدون بريد إلكتروني؟ اطلب من المرشد «بطاقة الدخول» وامسح الرمز بكاميرا الهاتف.</p>
            </form>
          ) : (
            <form onSubmit={verify} className="login-form">
              {message && <p className="note">{message}</p>}
              <label htmlFor="code">الرمز<RequiredMark /></label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(digits(e.target.value, 6))}
              />
              <button className="btn" disabled={busy || code.length !== 6}>دخول</button>
            </form>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          {/* Phones only, until the app is installed. */}
          <InstallAppButton className="btn btn-ghost install-app" />
        </div>
        <Ball className="login-ball" />
      </div>
    </div>
  );
}
