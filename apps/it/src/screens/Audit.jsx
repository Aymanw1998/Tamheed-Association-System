import { useCallback, useEffect, useState } from "react";
import { errorText, getAudit } from "../api";
import { auditActions, auditModules, fillText } from "../strings";
import FilterDialog from "../ui/FilterDialog.jsx";

const PAGE_SIZE = 50;
const FIELDS = ["from", "to", "module", "actor", "action", "targetId", "q"];
const when = (value) => (value ? new Date(value).toLocaleString("ar", { timeZone: "Asia/Jerusalem" }) : "—");
const show = (value) => (value === null || value === undefined || value === "" ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value));

function Changes({ changes }) {
  const entries = Object.entries(changes || {});
  if (entries.length === 0) return "—";
  return (
    <ul className="changes">
      {entries.map(([field, change]) => (
        <li key={field}><strong>{field}</strong>: {show(change?.before)} ← {show(change?.after)}</li>
      ))}
    </ul>
  );
}

// The audit log: today's screen of the everyday app, moved here. The system
// account's actions show as «النظام» (the server names the actor).
export default function Audit() {
  const [filters, setFilters] = useState({});
  const [draft, setDraft] = useState({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async (nextFilters, nextPage) => {
    const res = await getAudit(nextFilters, nextPage);
    if (!res.ok) return setError(res.data?.code === "BAD_DATE" ? "تاريخ غير صالح" : errorText(res));
    setError("");
    setData({ items: res.data.items || [], total: res.data.total || 0 });
  }, []);

  useEffect(() => { load(filters, page); }, [load, filters, page]);

  const set = (key) => (event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }));
  const apply = () => {
    const next = {};
    for (const key of FIELDS) if (draft[key]) next[key] = draft[key].trim();
    setPage(1);
    setFilters(next);
  };
  const clear = () => { setDraft({}); setPage(1); setFilters({}); };

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const count = Object.keys(filters).length;

  return (
    <section>
      <h1>سجل التغييرات</h1>
      <div className="toolbar">
        <FilterDialog count={count} onClear={clear} onApply={apply}>
          <label>من تاريخ<input name="from" type="date" value={draft.from || ""} onChange={set("from")} /></label>
          <label>إلى تاريخ<input name="to" type="date" value={draft.to || ""} onChange={set("to")} /></label>
          <label>
            القسم
            <select name="module" value={draft.module || ""} onChange={set("module")}>
              <option value="">الكل</option>
              {Object.entries(auditModules).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label>
            العملية
            <select name="action" value={draft.action || ""} onChange={set("action")}>
              <option value="">الكل</option>
              {Object.entries(auditActions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label>المنفّذ (رقم الهوية)<input name="actor" value={draft.actor || ""} onChange={set("actor")} /></label>
          <label>معرّف العنصر<input name="targetId" value={draft.targetId || ""} onChange={set("targetId")} /></label>
          <label>بحث نصي<input name="q" value={draft.q || ""} onChange={set("q")} /></label>
        </FilterDialog>
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      {!data ? <p role="status">…</p> : data.items.length === 0 ? <p>لا توجد سجلات</p> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>الوقت</th><th>المنفّذ</th><th>القسم</th><th>العملية</th><th>العنصر</th><th>التغييرات</th></tr>
            </thead>
            <tbody>
              {data.items.map((item, index) => (
                <tr key={item._id || index}>
                  <td>{when(item.at)}</td>
                  <td>{item.actor === "system" ? (item.realActorName ? `النظام (${item.realActorName})` : "النظام") : item.actorName || item.actor || "—"}</td>
                  <td>{auditModules[item.module] || item.module}</td>
                  <td>{auditActions[item.action] || item.action}</td>
                  <td>{item.targetLabel || (item.targetId === "system" ? "النظام" : item.targetId) || "—"}</td>
                  <td><Changes changes={item.changes} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && (
        <div className="row pager">
          <span>{fillText("المجموع: {n}", { n: data.total })}</span>
          <span>{fillText("صفحة {page} من {pages}", { page, pages })}</span>
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button>
          <button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>التالي</button>
        </div>
      )}
    </section>
  );
}
