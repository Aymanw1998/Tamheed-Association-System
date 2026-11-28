import { useEffect, useMemo, useState } from "react";
import * as api from "../api";
import { Link } from "../router.jsx";
import { toast } from "../ui/toast.jsx";
import { byTitle, matches } from "../arabic";
import { buildNasheedPdf, sharePdf, printPdf, pdfFileName } from "../pdf";

// Build a list for a performance or a rehearsal (owner, 2026-11-27): pick
// nasheeds from the library, put them in order, type a heading if wanted, and
// get the PDF to send or print. The list lives only on this screen: it is not
// saved anywhere and is gone when the screen is left.
let nextKey = 1;

export default function Build() {
  const [library, setLibrary] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState([]);
  const [heading, setHeading] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    api.listPublic().then((res) => {
      if (!alive) return;
      if (!res.ok) setError(api.errorText(res));
      else setLibrary([...(res.data.nasheeds || [])].sort(byTitle));
    });
    return () => { alive = false; };
  }, []);

  const shown = useMemo(() => (library || []).filter((n) => matches(n, query)), [library, query]);

  // A copy of the nasheed as loaded: the PDF prints it even if it is deleted meanwhile.
  const add = (n) => setPicked((list) => [...list, { key: nextKey++, title: n.title, lines: n.lines }]);
  const move = (index, by) => setPicked((list) => {
    const next = [...list];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    return next;
  });
  const remove = (key) => setPicked((list) => list.filter((item) => item.key !== key));

  const make = async (then) => {
    if (!picked.length || busy) return;
    setBusy(true);
    try {
      const blob = await buildNasheedPdf({ heading, nasheeds: picked.map(({ title, lines }) => ({ title, lines })) });
      const name = pdfFileName(heading);
      const outcome = await then(blob, name);
      if (outcome === "downloaded") toast.success("نُزّل ملف PDF إلى جهازك");
    } catch {
      toast.error("تعذّر إنشاء ملف PDF. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="page">
      <p className="back"><Link to="/">كل الأناشيد</Link></p>
      <h1>بناء قائمة</h1>
      <p className="muted">القائمة لا تُحفظ: اختر الأناشيد ورتّبها، ثم أنشئ ملف PDF لإرساله أو طباعته.</p>
      <div className="build-grid">
        <div className="card">
          <h2>الأناشيد</h2>
          <div className="toolbar">
            <input type="search" aria-label="بحث في الأناشيد" placeholder="ابحث بعنوان أو بكلمة" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {error && <p role="alert" className="error">{error}</p>}
          {!error && library === null && <p className="muted">جارٍ التحميل…</p>}
          <ul className="list">
            {shown.map((n) => (
              <li key={n._id} className="row">
                <span className="grow">{n.title}</span>
                <button type="button" aria-label={`إضافة «${n.title}» إلى القائمة`} onClick={() => add(n)}>إضافة</button>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h2>القائمة ({picked.length})</h2>
          <label htmlFor="heading">عنوان في أعلى الملف (اختياري)
            <input id="heading" placeholder="مثلًا: حفل الختام" value={heading} onChange={(e) => setHeading(e.target.value)} />
          </label>
          {picked.length === 0 && <p className="muted">لم تُضف أناشيد بعد.</p>}
          <ol className="picked">
            {picked.map((item, i) => (
              <li key={item.key}>
                <span className="grow">{item.title}</span>
                <button type="button" aria-label={`تحريك «${item.title}» للأعلى`} disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                <button type="button" aria-label={`تحريك «${item.title}» للأسفل`} disabled={i === picked.length - 1} onClick={() => move(i, 1)}>▼</button>
                <button type="button" aria-label={`إزالة «${item.title}» من القائمة`} onClick={() => remove(item.key)}>✕</button>
              </li>
            ))}
          </ol>
          <div className="row">
            <button type="button" className="primary" disabled={!picked.length || busy} onClick={() => make(sharePdf)}>{busy ? "جارٍ الإنشاء…" : "إنشاء PDF"}</button>
            <button type="button" disabled={!picked.length || busy} onClick={() => make(printPdf)}>طباعة</button>
          </div>
        </div>
      </div>
    </section>
  );
}
