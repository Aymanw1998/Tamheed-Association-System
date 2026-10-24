import { useState } from "react";
import { requestCode, verifyCode } from "./api.js";
import logo from "./logo.png";

const digits = (v, max) => v.replace(/\D/g, "").slice(0, max);
const GENERIC_ERROR = "حدث خطأ، حاول مرة أخرى";

export default function LoginPage({ onSignedIn }) {
  const [step, setStep] = useState("tz");
  const [tz, setTz] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
      if (r.ok) return onSignedIn();
      setError(r.data?.message || GENERIC_ERROR);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <img className="login-logo" src={logo} alt="شعار جمعية تمهيد" />
      <h1>تمهيد سبورت</h1>
      {step === "tz" ? (
        <form onSubmit={send} className="login-form">
          <label htmlFor="tz">رقم الهوية</label>
          <input
            id="tz"
            inputMode="numeric"
            autoComplete="off"
            value={tz}
            onChange={(e) => setTz(digits(e.target.value, 9))}
          />
          <button className="btn" disabled={busy || tz.length < 5}>أرسل الرمز</button>
        </form>
      ) : (
        <form onSubmit={verify} className="login-form">
          {message && <p className="note">{message}</p>}
          <label htmlFor="code">الرمز</label>
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
    </div>
  );
}
