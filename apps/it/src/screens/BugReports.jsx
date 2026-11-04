import { useCallback, useEffect, useState } from "react";
import { bugReportImage, deleteBugReport, errorText, getBugReports } from "../api";
import { roleLabel } from "../strings";
import ConfirmDialog from "../ui/ConfirmDialog.jsx";
import { toast } from "../ui/toast.jsx";

const TYPES = { fault: "عطل", suggestion: "اقتراح تحسين", problem: "مشكلة ملموسة" };
const KINDS = { server: "خطأ خادم", network: "الخادم لا يجيب", crash: "تعطل الشاشة" };

const when = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
};

function Field({ label, value }) {
  if (!value) return null;
  return <p className="report-field"><strong>{label}:</strong> <span dir="auto">{value}</span></p>;
}

// Reports from System (owner, 2026-11-04). «تم الحل» and «حذف» both delete the
// report and its picture for good.
export default function BugReports() {
  const [reports, setReports] = useState(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    const res = await getBugReports();
    if (res.ok) setReports(res.data.reports || []);
    else setError(errorText(res));
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async () => {
    const { id, doneText } = confirm;
    setConfirm(null);
    const res = await deleteBugReport(id);
    if (!res.ok) { toast.error(errorText(res)); return; }
    toast.success(doneText);
    await load();
  };

  if (error) return <p role="alert" className="error">{error}</p>;
  if (!reports) return <p role="status">…</p>;

  return (
    <section>
      <h1>البلاغات</h1>
      {reports.length === 0 ? <p>لا توجد بلاغات.</p> : (
        <ul className="list">
          {reports.map((report) => {
            const serverError = [report.errorStatus || "", report.errorCode, report.errorMessage].filter(Boolean).join(" ");
            return (
              <li key={report._id} data-report={report._id} className="report">
                <div className="row">
                  <span className={`badge ${report.type === "fault" ? "danger" : "info"}`}>{TYPES[report.type] || report.type}</span>
                  {report.errorKind && <span className="badge">{KINDS[report.errorKind] || report.errorKind}</span>}
                  <small className="muted">{when(report.createdAt)}</small>
                </div>
                <Field label="من أبلغ" value={[report.reporterName, report.reporterRole && roleLabel(report.reporterRole)].filter(Boolean).join(" - ")} />
                <Field label="القسم" value={report.section} />
                <Field label="الصفحة" value={report.page} />
                <Field label="الإجراء" value={report.action} />
                <Field label="خطأ الخادم" value={serverError} />
                <Field label="مصدر الخطأ" value={report.errorSource} />
                <Field label="رقم الطلب" value={report.requestId} />
                <Field label="الوصف" value={report.text} />
                <Field label="الجهاز" value={report.device} />
                {report.hasImage && (
                  <a href={bugReportImage(report._id)} target="_blank" rel="noreferrer">
                    <img className="report-image" src={bugReportImage(report._id)} alt="صورة مرفقة بالبلاغ" />
                  </a>
                )}
                <div className="row">
                  <button type="button" className="primary" onClick={() => setConfirm({ id: report._id, action: "تم الحل", doneText: "تم الحل وحُذف البلاغ" })}>تم الحل</button>
                  <button type="button" className="danger" onClick={() => setConfirm({ id: report._id, action: "حذف", doneText: "تم حذف البلاغ" })}>حذف</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.action}
          message="سيُحذف البلاغ وصورته نهائيًا ولا يمكن استرجاعهما."
          confirmText={confirm.action}
          danger={confirm.action === "حذف"}
          onConfirm={remove}
          onCancel={() => setConfirm(null)}
        />
      )}
    </section>
  );
}
