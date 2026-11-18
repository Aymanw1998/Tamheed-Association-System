import { formatDateTime } from "../generated/dateFormat";
import { useCallback, useEffect, useState } from "react";
import { errorText, getSensitiveViews } from "../api";

// «سجل الاطلاع» (owner, 2026-11-16): who opened a student's health details,
// the parents' phones or the parent's signature. Kept one year; only the fact
// of the look, never the details.
const FIELD_TEXT = { health_status: "الحالة الصحية", father_phone: "هاتف الأب", mother_phone: "هاتف الأم", signature: "توقيع ولي الأمر" };

export default function SensitiveViews() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await getSensitiveViews(page);
    if (res.ok) { setData(res.data); setError(""); } else setError(errorText(res));
  }, [page]);
  useEffect(() => { load(); }, [load]);

  if (error) return <p role="alert" className="error">{error}</p>;
  if (!data) return <p role="status">…</p>;
  const pages = Math.max(1, Math.ceil((data.total || 0) / (data.pageSize || 50)));

  return (
    <section>
      <h1>سجل الاطلاع</h1>
      <p className="muted">من فتح الحالة الصحية للطالب أو هواتف الأهل أو توقيع ولي الأمر. يُحفظ سنة واحدة.</p>
      {data.items.length === 0 ? <p>لا يوجد اطلاع مسجّل.</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>الوقت</th><th>من</th><th>الطالب</th><th>ما فُتح</th></tr></thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row._id}>
                  <td>{formatDateTime(row.at)}</td>
                  <td>{row.actorName || row.actor}</td>
                  <td>{row.studentLabel}</td>
                  <td>{(row.fields || []).map((f) => FIELD_TEXT[f] || f).join("، ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="row">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button>
          <span>{page} / {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>التالي</button>
        </div>
      )}
    </section>
  );
}
