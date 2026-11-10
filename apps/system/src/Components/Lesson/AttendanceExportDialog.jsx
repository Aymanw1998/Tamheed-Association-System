import React, { useEffect, useState } from "react";
import "../Provides/ConfirmContext.css";
import { exportAttendance } from "../../WebServer/services/attendance/functionsAttendance";
import { attendanceSheets, downloadWorkbook } from "../../utils/excelExport";
import styles from "./AttendanceExportDialog.module.css";

// «تصدير الحضور إلى Excel» (owner, 2026-11-10): one lesson's attendance over a
// period (default: this month so far), as an .xlsx with every mark and a
// per-person summary. The server sends only what the viewer may see.
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function AttendanceExportDialog({ lessonId, lessonName, onClose, today = new Date() }) {
  const [from, setFrom] = useState(() => iso(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [to, setTo] = useState(() => iso(today));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape" && !busy) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const submit = async (event) => {
    event?.preventDefault?.();
    setError("");
    setEmpty(false);
    setBusy(true);
    try {
      const res = await exportAttendance(lessonId, { from, to });
      if (!res.ok) return setError(res.message || "تعذّر تصدير الحضور");
      if (!res.rows.length) return setEmpty(true);
      await downloadWorkbook(`حضور ${res.lesson?.name || lessonName} ${from} - ${to}`, attendanceSheets(res.rows));
      onClose();
    } catch {
      setError("تعذّر إنشاء الملف، حاول مرة أخرى");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="c-overlay" onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <form className="c-dialog" role="dialog" aria-modal="true" aria-labelledby="attendance-export-title" dir="rtl" onSubmit={submit}>
        <div className="c-header"><h3 id="attendance-export-title">تصدير الحضور إلى Excel</h3></div>
        <div className={`c-body ${styles.fields}`}>
          <p className={styles.note}>{lessonName}: كل تسجيلات الحضور في الفترة، وملخص لكل مشترك.</p>
          <label className={styles.field}>
            <span>من تاريخ</span>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} required />
          </label>
          <label className={styles.field}>
            <span>حتى تاريخ</span>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} required />
          </label>
          {empty && <p className={styles.note} role="status">لا يوجد حضور مسجّل في هذه الفترة</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
        <div className="c-actions">
          <button type="button" className="c-btn" disabled={busy} onClick={onClose}>إلغاء</button>
          <button type="submit" className="c-btn c-btn-primary" disabled={busy || !from || !to}>
            {busy ? "جارٍ التحضير..." : "تنزيل Excel"}
          </button>
        </div>
      </form>
    </div>
  );
}
