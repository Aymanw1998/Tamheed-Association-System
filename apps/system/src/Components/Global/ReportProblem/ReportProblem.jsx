import RequiredMark from "../../UI/RequiredMark";
import React, { useEffect, useState } from "react";
import api, { getAuthToken } from "../../../WebServer/services/api";
import { clearProblem, recentProblem, sectionOf, subscribeProblem } from "../../../WebServer/services/problemLog";
import { toast } from "../../../ALERT/SystemToasts.jsx";
import "./ReportProblem.css";

const TYPES = [
  { value: "fault", label: "عطل" },
  { value: "suggestion", label: "اقتراح تحسين" },
  { value: "problem", label: "مشكلة ملموسة" },
];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SENT = "تم إرسال البلاغ إلى قسم IT";
const FAILED = "تعذر إرسال البلاغ، حاول مرة أخرى";

// Sends the error of the last two minutes. "sent", "none" (nothing to send, or
// the server finds it too old) or "failed".
export async function sendRecentProblem() {
  const problem = recentProblem();
  if (!problem) return "none";
  try {
    await api.post("/bug-reports", {
      mode: "auto",
      requestId: problem.requestId || undefined,
      kind: problem.kind,
      ageMs: problem.ageMs,
      action: problem.action,
      message: problem.message,
      section: problem.section,
      page: problem.page,
    });
    clearProblem();
    return "sent";
  } catch (error) {
    if (error?.response?.data?.code === "NO_RECENT_ERROR") {
      clearProblem();
      return "none";
    }
    return "failed";
  }
}

function ReportWindow({ onClose }) {
  const [type, setType] = useState("fault");
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const choose = (event) => {
    const picked = event.target.files?.[0] || null;
    if (picked && picked.size > MAX_IMAGE_BYTES) {
      setError("الصورة كبيرة جدًا (حتى 5 ميغابايت)");
      event.target.value = "";
      setFile(null);
      return;
    }
    setError("");
    setFile(picked);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!text.trim()) { setError("اكتب وصفًا قصيرًا أولًا"); return; }
    const body = new FormData();
    body.append("mode", "manual");
    body.append("type", type);
    body.append("text", text.trim());
    body.append("section", sectionOf(window.location.pathname));
    body.append("page", window.location.pathname);
    if (file) body.append("image", file);
    setBusy(true);
    try {
      await api.post("/bug-reports", body, { headers: { "Content-Type": "multipart/form-data" }, timeout: 60000 });
      toast.success(SENT);
      onClose();
    } catch (failure) {
      setError(failure?.response?.data?.message || FAILED);
      setBusy(false);
    }
  };

  return (
    <div className="report-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="report-dialog" role="dialog" aria-modal="true" aria-label="الإبلاغ عن مشكلة" dir="rtl">
        <h3>الإبلاغ عن مشكلة</h3>
        <form onSubmit={submit}>
          <label htmlFor="report-type">النوع</label>
          <select id="report-type" value={type} onChange={(event) => setType(event.target.value)}>
            {TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <label htmlFor="report-text">الوصف<RequiredMark /></label>
          <textarea id="report-text" rows={4} maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} />
          <label htmlFor="report-image">صورة (اختياري)</label>
          <input id="report-image" type="file" accept="image/png,image/jpeg,image/webp" onChange={choose} />
          {error && <p role="alert" className="report-error">{error}</p>}
          <div className="report-actions">
            <button type="button" onClick={onClose}>إلغاء</button>
            <button type="submit" className="report-send" disabled={busy}>إرسال</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// The button beside everything (owner, 2026-11-04): after an error, one press
// sends it; otherwise it opens the window.
export default function ReportProblem() {
  const [signedIn, setSignedIn] = useState(() => Boolean(getAuthToken()));
  const [hasProblem, setHasProblem] = useState(() => Boolean(recentProblem()));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const check = () => {
      setSignedIn(Boolean(getAuthToken()));
      setHasProblem(Boolean(recentProblem()));
    };
    const stop = subscribeProblem(check);
    const timer = setInterval(check, 1000);
    return () => { stop(); clearInterval(timer); };
  }, []);

  if (!signedIn) return null;

  const press = async () => {
    if (busy) return;
    setBusy(true);
    const result = await sendRecentProblem();
    setBusy(false);
    if (result === "sent") toast.success(SENT);
    else if (result === "failed") toast.error(FAILED);
    else setOpen(true);
  };

  return (
    <>
      {/* Room at the end of the page, so the button never covers what is last there. */}
      <div className="report-room" aria-hidden="true" />
      <button type="button" className={`report-problem${hasProblem ? " has-problem" : ""}`} onClick={press} disabled={busy}>
        {hasProblem ? "حدث خطأ · أرسل بلاغًا" : "إبلاغ عن مشكلة"}
      </button>
      {open && <ReportWindow onClose={() => setOpen(false)} />}
    </>
  );
}
