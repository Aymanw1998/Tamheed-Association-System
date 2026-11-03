import { BellIcon } from "./Art.jsx";

const dateLabel = (v) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB");
};

// The staff's notices to this player, newest first. `seenBefore` marks the
// ones that arrived since the tab was last opened.
export default function NoticesPage({ notices, seenBefore, failed }) {
  return (
    <section className="panel">
      <h2 className="panel-title">الإعلانات</h2>
      {failed ? (
        <p className="muted">تعذّر تحميل الإعلانات. حاول مرة أخرى عند الاتصال بالإنترنت.</p>
      ) : notices.length ? (
        <ul className="notice-list">
          {notices.map((n) => {
            const fresh = new Date(n.createdAt).getTime() > seenBefore;
            return (
              <li key={n.id} className={fresh ? "fresh" : ""}>
                <span className="notice-icon" aria-hidden="true"><BellIcon /></span>
                <div>
                  <b>
                    {n.title}
                    {fresh && <span className="pill">جديد</span>}
                  </b>
                  {n.body && <p>{n.body}</p>}
                  <small>
                    {dateLabel(n.createdAt)}
                    {n.lessonName ? ` · ${n.lessonName}` : ""}
                  </small>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">لا توجد إعلانات بعد</p>
      )}
    </section>
  );
}
