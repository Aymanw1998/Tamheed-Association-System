import React, { useEffect, useRef, useState } from "react";
import "../Provides/ConfirmContext.css";
import RequiredMark from "../UI/RequiredMark";
import { makeStaff } from "../../WebServer/services/student/functionsStudent.jsx";

// «تحويل إلى الطاقم» (owner, 2026-11-13/14/19): a new staff account from the
// student's own name and ID number; the manager picks مساعد or مرشد and gives
// the first password. The same window finishes a conversion that stopped half
// way («إكمال التحويل»): the role is already chosen, and the password is asked
// again only while the account is not made yet.
const ACCOUNT_MADE = new Set(["account", "rosters"]);

export default function MakeStaffDialog({ student, onDone, onClose, onFailed = () => {} }) {
  const conv = student?.staffConversion || null;
  const resuming = Boolean(conv);
  const needsAccount = !conv || !ACCOUNT_MADE.has(conv.phase);
  const [role, setRole] = useState(conv?.role || "");
  const [phone, setPhone] = useState(student?.phone || "");
  const [email, setEmail] = useState(student?.email || "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const first = useRef(null);
  const dialog = useRef(null);
  const submitButton = useRef(null);
  // Focus goes into the window (the first field, or the button when a resume
  // asks for nothing), stays inside it while it is open (Tab wraps), and goes
  // back to the button that opened it on close (testing review, 2026-11-20).
  useEffect(() => {
    const opener = document.activeElement;
    (first.current || submitButton.current)?.focus();
    return () => { if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus(); };
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) { onClose(); return; }
      if (e.key !== "Tab" || !dialog.current) return;
      const items = [...dialog.current.querySelectorAll("button, input, select, textarea, a[href]")].filter((el) => !el.disabled);
      if (!items.length) return;
      const [head, tail] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === head) { e.preventDefault(); tail.focus(); }
      else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const name = `${student?.firstname || ""} ${student?.lastname || ""}`.trim();
  const ready = (resuming || role) && (!needsAccount || (password.trim() && phone.trim()));

  const submit = async (event) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    const res = await makeStaff(student._id, { role, password, phone: phone.trim(), email: email.trim() });
    setBusy(false);
    if (!res.ok) { setError(res.message); onFailed(res); return; }
    onDone(res);
  };

  return (
    <div className="c-overlay" role="dialog" aria-modal="true" aria-labelledby="make-staff-title">
      <form ref={dialog} className="c-dialog" onSubmit={submit} aria-describedby={error ? "make-staff-error" : undefined}>
        <div className="c-header"><h3 id="make-staff-title">{resuming ? "إكمال التحويل إلى الطاقم" : "تحويل إلى الطاقم"}</h3></div>
        <div className="c-body" style={{ display: "grid", gap: 10 }}>
          <p>
            {name} ({student?.tz}) يصبح من الطاقم. يُنقل إلى البرامج التي هو فيها كعضو طاقم،
            ويبقى سجله كطالب في «طلاب سابقون» مع كل حضوره.
          </p>
          {!resuming && (
            <label style={{ display: "grid", gap: 6 }}>
              <span>الدور<RequiredMark /></span>
              <select ref={first} value={role} onChange={(e) => setRole(e.target.value)} required>
                <option value="">اختر الدور</option>
                <option value="مساعد">مساعد</option>
                <option value="مرشد">مرشد</option>
              </select>
            </label>
          )}
          {needsAccount && (
            <>
              <label style={{ display: "grid", gap: 6 }}>
                <span>الهاتف<RequiredMark /></span>
                <input ref={resuming ? first : undefined} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span>البريد الإلكتروني</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span>كلمة المرور الأولى<RequiredMark /></span>
                <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <small>يُطلب منه تغييرها عند أول دخول.</small>
              </label>
            </>
          )}
          {error && <p id="make-staff-error" role="alert" style={{ color: "red" }}>{error}</p>}
        </div>
        <div className="c-actions">
          <button type="button" className="c-btn" onClick={onClose} disabled={busy}>إلغاء</button>
          <button ref={submitButton} type="submit" className="c-btn c-btn-primary" disabled={!ready || busy}>{busy ? "جارٍ التحويل…" : resuming ? "إكمال التحويل" : "تحويل"}</button>
        </div>
      </form>
    </div>
  );
}
