import { useEffect, useRef, useState } from "react";
import { errorText, login, loginPass, verify } from "../api";
import logo from "../logo.png";
import EyeIcon from "../ui/EyeIcon.jsx";
import { passkeySupported, signInWithPasskey } from "../passkey";

const PASS_FAILED = "انتهت صلاحية الانتقال، سجّل الدخول من جديد";

// ID number + password, then the code sent to the user's email. With `pass`
// (from the everyday app) the password step is skipped: the server checks the
// pass and sends the code. No sign-up here.
export default function SignIn({ pass = "", onSignedIn }) {
  const [step, setStep] = useState(pass ? "pass" : "password"); // pass | password | code
  const [tz, setTz] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [canPasskey] = useState(passkeySupported);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const passTried = useRef(false);

  useEffect(() => {
    if (!pass || passTried.current) return;
    passTried.current = true;
    loginPass(pass).then((res) => {
      if (res.ok && res.data.tz) {
        setTz(String(res.data.tz));
        setMessage(res.data.message || "");
        setStep("code");
      } else {
        setError(res.status === 429 ? errorText(res) : PASS_FAILED);
        setStep("password");
      }
    });
  }, [pass]);

  const sendPassword = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const res = await login(tz.trim(), password);
    setBusy(false);
    // The server answers the same whether or not a code was sent.
    if (!res.ok) return setError(errorText(res));
    setPassword("");
    setMessage(res.data.message || "");
    setStep("code");
  };

  const sendCode = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const res = await verify(tz.trim(), code.trim());
    setBusy(false);
    if (!res.ok) return setError(errorText(res));
    onSignedIn();
  };

  // A passkey saved on this device: a fingerprint or face, no ID number,
  // password or code.
  const withPasskey = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await signInWithPasskey();
      if (r.ok) return onSignedIn();
      if (!r.cancelled) setError(r.message || "تعذّر الدخول بالبصمة. ادخل بكلمة المرور والرمز");
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setStep("password");
    setCode("");
    setMessage("");
    setError("");
  };

  return (
    <main className="signin">
      <img className="signin-logo" src={logo} alt="شعار جمعية تمهيد - قسم IT" />
      <h1>قسم تكنولوجيا المعلومات</h1>
      {step === "pass" && <p role="status">جارٍ الانتقال…</p>}

      {step === "password" && canPasskey && (
        <>
          <button type="button" className="primary btn-passkey" onClick={withPasskey} disabled={busy}>الدخول بالبصمة أو بالوجه</button>
          <p className="signin-or">أو بكلمة المرور</p>
        </>
      )}

      {step === "password" && (
        <form onSubmit={sendPassword}>
          <label>
            رقم الهوية
            <input name="tz" inputMode="numeric" autoComplete="username" value={tz} onChange={(e) => setTz(e.target.value)} required />
          </label>
          <label>
            كلمة المرور
            <span className="password-wrap">
              <input name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                aria-pressed={showPassword}
              >
                <EyeIcon open={showPassword} />
              </button>
            </span>
          </label>
          {error && <p role="alert" className="error">{error}</p>}
          <button type="submit" className="primary" disabled={busy}>متابعة</button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={sendCode}>
          {message && <p role="status">{message}</p>}
          <label>
            الرمز المرسل إلى بريدك الإلكتروني
            <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required />
          </label>
          {error && <p role="alert" className="error">{error}</p>}
          <div className="row">
            <button type="submit" className="primary" disabled={busy}>دخول</button>
            <button type="button" onClick={back}>رجوع</button>
          </div>
        </form>
      )}
    </main>
  );
}
