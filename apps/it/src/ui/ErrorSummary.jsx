import { useEffect, useState } from "react";
import { getErrorSummary } from "../api";
import { formatDateTime } from "../generated/dateFormat";

// «ملخص الأخطاء» (owner, 2026-11-16): the server's errors of the last 7 days,
// collected automatically and grouped by where and what failed.
export default function ErrorSummary() {
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    let live = true;
    getErrorSummary().then((res) => { if (live && res.ok) setSummary(res.data.summary); });
    return () => { live = false; };
  }, []);

  if (!summary) return null;
  return (
    <div className="card error-summary">
      <h2>ملخص الأخطاء: آخر 7 أيام</h2>
      {summary.total === 0 ? <p>لم يقع أي خطأ في الخادم هذا الأسبوع.</p> : (
        <>
          <p>{summary.total} أخطاء في الخادم. الأكثر تكرارًا أولًا:</p>
          <ul className="list">
            {summary.groups.map((group) => (
              <li key={[group.source, group.code, group.message, group.action].join("|")}>
                <span className="badge danger">{group.count}×</span>{" "}
                <strong dir="auto">{group.message || group.code || "خطأ"}</strong>
                <div className="muted" dir="auto">
                  {[group.action, group.source, group.status].filter(Boolean).join(" · ")} · آخر مرة {formatDateTime(group.lastAt)}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
