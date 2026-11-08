import { useEffect, useRef, useState } from "react";
import api from "../../WebServer/services/api";
import Button from "../UI/Button";
import { canStored, getStoredUserId } from "../../utils/session";

export default function ReportPdfAction({ report, tour }) {
  const [job, setJob] = useState(null), [error, setError] = useState("");
  const alive = useRef(true), timer = useRef(null), busy = useRef(false), generation = useRef(0);
  const base = `/report/${encodeURIComponent(report._id)}/pdf/jobs`;
  const storageKey = `report.pdf:${getStoredUserId()}:${report._id}`;
  const remember = (value) => { try { if (value?.id) sessionStorage.setItem(storageKey, JSON.stringify({ id: value.id, expiresAt: value.expiresAt })); else sessionStorage.removeItem(storageKey); } catch {} };
  useEffect(() => {
    alive.current = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (canStored("reports.exportPdf") && saved?.id && saved.expiresAt > Date.now()) { busy.current = true; setJob({ id: saved.id, state: "queued" }); poll(saved.id, ++generation.current); }
      else sessionStorage.removeItem(storageKey);
    } catch {}
    return () => { alive.current = false; generation.current++; clearTimeout(timer.current); };
    // A job belongs to this signed-in user and report; changing either resumes its own job.
  }, [storageKey]);
  const poll = async (id, ticket) => {
    try {
      const { data } = await api.get(`${base}/${id}`);
      if (!alive.current || ticket !== generation.current) return;
      setJob(data.job);
      remember(data.job);
      if (["queued", "rendering"].includes(data.job.state)) timer.current = setTimeout(() => poll(id, ticket), 1500);
      else busy.current = false;
    } catch { if (alive.current && ticket === generation.current) { busy.current = false; remember(null); setError("تعذّر متابعة تجهيز الملف. حاول من جديد."); setJob(null); } }
  };
  const start = async () => {
    if (busy.current) return; busy.current = true; setError(""); setJob({ state: "queued" });
    const ticket = ++generation.current;
    try { const { data } = await api.post(base); if (alive.current && ticket === generation.current) { setJob(data.job); remember(data.job); poll(data.job.id, ticket); } }
    catch (error) { busy.current = false; if (alive.current) { setJob(null); setError(error.response?.data?.message || "تعذّر تجهيز الملف"); } }
  };
  const cancel = async () => { generation.current++; clearTimeout(timer.current); remember(null); try { await api.delete(`${base}/${job.id}`); } catch { if (alive.current) setError("تعذّر إلغاء العملية. ستنتهي صلاحيتها تلقائيًا."); } finally { busy.current = false; if (alive.current) setJob(null); } };
  const download = async () => {
    try {
      const { data } = await api.get(`${base}/${job.id}/file`, { responseType: "blob" });
      const url = URL.createObjectURL(data), link = document.createElement("a");
      link.href = url; link.download = "tamheed-report.pdf"; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch { remember(null); setError("تعذّر تنزيل الملف. أعد تجهيز التقرير."); setJob(null); }
  };
  if (!canStored("reports.exportPdf")) return null;
  const working = ["queued", "rendering"].includes(job?.state);
  return <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
    {working ? <><small role="status">{job.state === "queued" ? "بانتظار تجهيز PDF…" : "جارٍ تجهيز PDF بالخلفية…"}</small><Button size="sm" variant="secondary" disabled={!job.id} onClick={cancel}>إلغاء</Button></>
      : job?.state === "ready" ? <Button size="sm" onClick={download}>تنزيل PDF</Button>
        : <Button size="sm" variant="secondary" data-tour={tour} onClick={start}>ملف التقرير</Button>}
    {(error || job?.state === "failed") && <small role="alert" style={{ color: "var(--color-danger-700)" }}>{error || (job.code === "PDF_UNAVAILABLE" ? "تصدير PDF غير متاح مؤقتًا. تواصل مع مسؤول النظام." : "تعذّر تجهيز الملف. يمكنك إعادة المحاولة.")}</small>}
  </span>;
}
