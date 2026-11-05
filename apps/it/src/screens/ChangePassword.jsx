import RequiredMark from "../ui/RequiredMark";
import { useState } from "react";
import { changeOwnPassword, errorText } from "../api";
import logo from "../logo.png";
import EyeIcon from "../ui/EyeIcon.jsx";
import { toast } from "../ui/toast.jsx";

// Any non-empty password (owner, 2026-11-03).
const ERRORS = {
  PASSWORD_REQUIRED: "يجب إدخال كلمة مرور جديدة.",
  PASSWORD_TOO_LONG: "كلمة المرور الجديدة طويلة جدًا.",
};

// A new IT user's temporary password (owner, 2026-11-03): right after the
// first sign-in, nothing else opens until he chooses his own.
export default function ChangePassword({ onDone, onSignOut }) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!password) return setError(ERRORS.PASSWORD_REQUIRED);
    if (password !== again) return setError("كلمتا المرور غير متطابقتين");
    setBusy(true);
    const res = await changeOwnPassword(password);
    setBusy(false);
    if (!res.ok) return setError(errorText(res, ERRORS));
    toast.success("تم تغيير كلمة المرور");
    onDone();
  };

  return (
    <main className="signin">
      <span className="signin-logo signin-logo-small"><img src={logo} alt="شعار جمعية تمهيد - قسم IT" /></span>
      <h1>تغيير كلمة المرور</h1>
      <p className="muted">دخلت بكلمة مرور مؤقتة. اختر كلمة مرور جديدة لتتابع.</p>
      <form onSubmit={submit}>
        <label>
          <span>كلمة المرور الجديدة<RequiredMark /></span>
          <span className="password-wrap">
            <input name="newPassword" type={show ? "text" : "password"} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button
              type="button"
              className="toggle-password"
              onClick={() => setShow((value) => !value)}
              aria-label={show ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              aria-pressed={show}
            >
              <EyeIcon open={show} />
            </button>
          </span>
        </label>
        <label>
          <span>تأكيد كلمة المرور<RequiredMark /></span>
          <input name="confirmPassword" type={show ? "text" : "password"} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} required />
        </label>
        {error && <p role="alert" className="error">{error}</p>}
        <button type="submit" className="primary" disabled={busy}>حفظ ومتابعة</button>
        <button type="button" onClick={onSignOut} disabled={busy}>تسجيل الخروج</button>
      </form>
    </main>
  );
}
