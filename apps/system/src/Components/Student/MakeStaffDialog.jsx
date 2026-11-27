import React, { useEffect, useRef, useState } from "react";
import "../Provides/ConfirmContext.css";
import RequiredMark from "../UI/RequiredMark";
import { makeStaff, makeStaffPreview } from "../../WebServer/services/student/functionsStudent.jsx";

// «تحويل إلى الطاقم» (owner, 2026-11-13/14/19): a new staff account from the
// student's own name and ID number; the manager picks مساعد or مرشد and gives
// the first password. The same window finishes a conversion that stopped half
// way («إكمال التحويل»): the role is already chosen, and the password is asked
// again only while the account is not made yet.
//
// Staff with his ID number already there (owner, 2026-11-26): the window says
// so as soon as it opens. An active account he may be linked to: no role,
// password or phone are asked, and he is linked to it («ربط بالحساب»). Not
// active, another student's, or a role the user may not give: it says why and
// nothing can be sent.
const ACCOUNT_MADE = new Set(["account", "rosters"]);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NOTE = { display: "block", margin: 0, padding: "10px 14px", borderRadius: 8, lineHeight: 1.6 };
const INFO = { ...NOTE, background: "var(--info-bg, #eef5ff)", border: "1px solid var(--info-border, #b9d3f5)", color: "var(--info-text, #1d3d66)" };
const WARN = { ...NOTE, background: "var(--warn-bg, #fff6e5)", border: "1px solid var(--warn-border, #f0c36d)", color: "var(--warn-text, #6b4a00)" };

function whyBlocked(existing) {
  const who = `يوجد في الطاقم حساب بنفس رقم الهوية: ${existing.name}${existing.role ? ` (${existing.role})` : ""}`;
  if (!existing.active) return `${who}، لكنه غير فعّال (ينتظر الموافقة أو موقوف). فعّله أولًا ثم حاول مرة أخرى.`;
  if (existing.linkedElsewhere) return `${who}، وهو مرتبط بطالب آخر. لا يمكن التحويل.`;
  return `${who}، ولا يمكنك ربط الطالب بحساب بهذا الدور.`;
}

export default function MakeStaffDialog({ student, onDone, onClose, onFailed = () => {} }) {
  const conv = student?.staffConversion || null;
  const resuming = Boolean(conv);
  // undefined while the first look runs; null when there is no such staff.
  const [existing, setExisting] = useState(undefined);
  const looked = existing !== undefined;
  const linking = Boolean(conv?.linkUserId) || Boolean(existing && existing.active && !existing.linkedElsewhere && existing.mayLink);
  const blocked = Boolean(existing) && !linking;
  const needsAccount = !linking && !blocked && (!conv || !ACCOUNT_MADE.has(conv.phase));
  const [role, setRole] = useState(conv?.role || "");
  const [phone, setPhone] = useState(student?.phone || "");
  const [email, setEmail] = useState(student?.email || "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [emailBad, setEmailBad] = useState(false);
  const emailInput = useRef(null);
  const first = useRef(null);
  const dialog = useRef(null);
  const submitButton = useRef(null);
  const cancelButton = useRef(null);
  // Focus goes into the window (the first field, or the button when a resume
  // asks for nothing), stays inside it while it is open (Tab wraps), and goes
  // back to the button that opened it on close (testing review, 2026-11-20).
  useEffect(() => {
    const opener = document.activeElement;
    (first.current || submitButton.current)?.focus();
    return () => { if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus(); };
  }, []);
  useEffect(() => {
    let alive = true;
    Promise.resolve(makeStaffPreview(student?._id))
      .then((res) => res?.existing || null, () => null)
      .then((found) => { if (alive) setExisting(found); });
    return () => { alive = false; };
  }, [student?._id]);
  // After the first look: the fields went away (linking, or nothing can be
  // sent), or the button was still disabled when the window opened (a resume
  // that asks for nothing): focus moves to what is there instead of being lost.
  useEffect(() => {
    if (!looked) return;
    if (existing) { (linking ? submitButton.current : cancelButton.current)?.focus(); return; }
    if (!dialog.current?.contains(document.activeElement)) (first.current || submitButton.current)?.focus();
  }, [looked, existing, linking]);
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
  const ready = looked && !blocked && (linking || ((resuming || role) && (!needsAccount || (password.trim() && phone.trim()))));

  const submit = async (event) => {
    event.preventDefault();
    if (!ready || busy) return;
    // The form has noValidate: Safari on the iPhone refused it silently when the
    // student's saved email (never checked) was not valid (2026-11-26).
    if (needsAccount && email.trim() && !EMAIL.test(email.trim())) {
      setEmailBad(true);
      setError("البريد الإلكتروني غير صالح. صحّحه أو اتركه فارغًا.");
      emailInput.current?.focus();
      return;
    }
    setEmailBad(false);
    setBusy(true);
    setError("");
    const res = await makeStaff(student._id, linking ? {} : { role, password, phone: phone.trim(), email: email.trim() });
    setBusy(false);
    if (!res.ok) { setError(res.message); onFailed(res); return; }
    onDone(res);
  };

  const label = busy ? "جارٍ التحويل…" : resuming ? "إكمال التحويل" : linking ? "ربط بالحساب" : "تحويل";

  return (
    <div className="c-overlay" role="dialog" aria-modal="true" aria-labelledby="make-staff-title">
      <form ref={dialog} className="c-dialog" onSubmit={submit} noValidate aria-describedby={error ? "make-staff-error" : undefined}>
        <div className="c-header"><h3 id="make-staff-title">{resuming ? "إكمال التحويل إلى الطاقم" : "تحويل إلى الطاقم"}</h3></div>
        <div className="c-body" style={{ display: "grid", gap: 10 }}>
          <p>
            {name} ({student?.tz}) يصبح من الطاقم. يُنقل إلى البرامج التي هو فيها كعضو طاقم،
            ويبقى سجله كطالب في «طلاب سابقون» مع كل حضوره.
          </p>
          {linking && (
            <p role="status" style={INFO}>
              {existing
                ? `يوجد في الطاقم حساب بنفس رقم الهوية: ${existing.name}${existing.role ? ` (${existing.role})` : ""}. يُربط الطالب بهذا الحساب ولا يُنشأ حساب جديد؛ يبقى دوره وتفاصيله وكلمة مروره كما هي.`
                : "يُكمل ربط الطالب بحسابه الموجود في الطاقم."}
            </p>
          )}
          {blocked && <p role="alert" style={WARN}>{whyBlocked(existing)}</p>}
          {!resuming && !linking && !blocked && (
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
                <input ref={emailInput} type="email" value={email} aria-invalid={emailBad || undefined} onChange={(e) => { setEmail(e.target.value); setEmailBad(false); }} />
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
          <button ref={cancelButton} type="button" className="c-btn" onClick={onClose} disabled={busy}>إلغاء</button>
          <button ref={submitButton} type="submit" className="c-btn c-btn-primary" disabled={!ready || busy}>{label}</button>
        </div>
      </form>
    </div>
  );
}
