import RequiredMark from "./RequiredMark";
import { useEffect, useState } from "react";
import { createItUser, errorText } from "../api";
import { ROLES, newItUserText as text, roleLabel } from "../strings";
import { toast } from "./toast.jsx";
import "./dialog.css";

const EMPTY = { firstname: "", lastname: "", tz: "", email: "", phone: "", role: "" };

// «مستخدم IT جديد»: a brand-new user who is IT from the start (any IT user).
// The server sends him a temporary password by email; no screen shows it.
export default function NewItUserDialog({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    const res = await createItUser({ ...form, role: form.role || null });
    setBusy(false);
    if (!res.ok) return toast.error(errorText(res, text.errors));
    toast.success(text.created);
    onCreated?.(res.data.member);
    onClose();
  };

  return (
    <div className="c-overlay" onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <form className="c-dialog new-it-user" role="dialog" aria-modal="true" aria-label={text.title} dir="rtl" onSubmit={submit}>
        <div className="c-header"><h3>{text.title}</h3></div>
        <div className="c-body">
          <p className="muted">{text.intro}</p>
          <div className="form-grid">
            <label><span>{text.firstname}<RequiredMark /></span><input name="firstname" value={form.firstname} onChange={set("firstname")} required /></label>
            <label><span>{text.lastname}<RequiredMark /></span><input name="lastname" value={form.lastname} onChange={set("lastname")} required /></label>
            <label><span>{text.tz}<RequiredMark /></span><input name="tz" inputMode="numeric" value={form.tz} onChange={set("tz")} required /></label>
            <label><span>{text.email}<RequiredMark /></span><input name="email" type="email" value={form.email} onChange={set("email")} required /></label>
            <label>{text.phone}<input name="phone" type="tel" value={form.phone} onChange={set("phone")} /></label>
            <label>
              {text.role}
              <select name="role" value={form.role} onChange={set("role")}>
                <option value="">{text.noRole}</option>
                {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="c-actions">
          <button type="button" onClick={onClose} disabled={busy}>{text.cancel}</button>
          <button type="submit" className="primary" disabled={busy}>{text.create}</button>
        </div>
      </form>
    </div>
  );
}
