import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../api";
import { Link } from "../router.jsx";
import { useSession } from "../session.jsx";
import { byTitle, matches } from "../arabic";

// Every nasheed, A–Z, with a search over the title and every line (owner,
// 2026-11-27). Anyone may read; the manager also sees «إضافة نشيد» and
// «بناء قائمة».
export default function Library() {
  const { user } = useSession();
  const [list, setList] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setError("");
    const res = await api.listPublic();
    if (!res.ok) { setError(api.errorText(res)); return; }
    setList([...(res.data.nasheeds || [])].sort(byTitle));
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => (list || []).filter((n) => matches(n, query)), [list, query]);

  return (
    <section className="page">
      <div className="page-head">
        <h1>الأناشيد</h1>
        {user && (
          <div className="row">
            <Link to="/new" className="button primary">إضافة نشيد</Link>
            <Link to="/build" className="button">بناء قائمة</Link>
          </div>
        )}
      </div>
      <div className="toolbar">
        <input type="search" aria-label="بحث في العناوين والأبيات" placeholder="ابحث بعنوان أو بكلمة من الأبيات" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {error && (
        <div role="alert" className="card">
          <p className="error">{error}</p>
          <button type="button" onClick={load}>إعادة المحاولة</button>
        </div>
      )}
      {!error && list === null && <p className="center muted">جارٍ التحميل…</p>}
      {!error && list?.length === 0 && <p className="center muted">لا توجد أناشيد بعد</p>}
      {!error && list?.length > 0 && shown.length === 0 && <p className="center muted">لا توجد نتائج</p>}
      {shown.length > 0 && (
        <ul className="list">
          {shown.map((n) => (
            <li key={n._id}><Link to={`/n/${n._id}`} className="row-link"><strong>{n.title}</strong></Link></li>
          ))}
        </ul>
      )}
    </section>
  );
}
