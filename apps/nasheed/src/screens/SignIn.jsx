import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import * as api from "../api";
import { navigate } from "../router.jsx";
import { safeNext, useSession } from "../session.jsx";

// Staff sign-in with the Tamheed ID number and password (owner, 2026-11-27).
// noValidate: Safari on the iPhone silently refuses a form whose native
// validation fails (the lesson of 2026-11-26); the checks are ours.
export default function SignIn() {
  const { setUser } = useSession();
  const [tz, setTz] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const first = useRef(null);
  useEffect(() => { first.current?.focus(); }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    if (!tz.trim() || !password) { setError("أدخل رقم الهوية وكلمة المرور"); return; }
    setBusy(true);
    setError("");
    const res = await api.login(tz.trim(), password);
    setBusy(false);
    if (!res.ok) { setError(api.errorText(res)); return; }
    // Committed before navigating: navigate() fires popstate, which React renders
    // at once, and a staff screen must already see the user (StaffOnly).
    flushSync(() => setUser(res.data.user || { name: "" }));
    navigate(safeNext(new URLSearchParams(window.location.search).get("next")));
  };

  return (
    <section className="signin-page">
      <div className="signin card">
        <h1>دخول المسؤول عن الأناشيد</h1>
        <p className="muted">بحساب جمعية تمهيد. قراءة الأناشيد لا تحتاج دخولًا.</p>
        <form onSubmit={submit} noValidate aria-describedby={error ? "signin-error" : undefined}>
          <label htmlFor="tz">رقم الهوية
            <input ref={first} id="tz" inputMode="numeric" autoComplete="username" value={tz} onChange={(e) => setTz(e.target.value)} />
          </label>
          <label htmlFor="password">كلمة المرور
            <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {error && <p id="signin-error" role="alert" className="error">{error}</p>}
          <button type="submit" className="primary signin-submit" disabled={busy}>{busy ? "جارٍ الدخول…" : "دخول"}</button>
        </form>
        <p><a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }}>العودة إلى الأناشيد</a></p>
      </div>
    </section>
  );
}
