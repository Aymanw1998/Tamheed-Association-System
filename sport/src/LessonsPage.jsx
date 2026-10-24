import { lessonTime, historyLabel, attendanceLabel } from "./format.js";

const STATUS_CLASS = { "حاضر": "ok", "غائب": "bad", "متأخر": "late" };
const same = (a, b) => a && b && a.day === b.day && a.startMin === b.startMin && a.name === b.name;

export default function LessonsPage({ me }) {
  const { lessons, history, nextLesson } = me;
  const att = me.card?.attendance || {};
  return (
    <>
      <section className="panel">
        <h2 className="panel-title">دروسي الأسبوعية</h2>
        {lessons.length ? (
          <ul className="lesson-list">
            {lessons.map((l, i) => (
              <li key={i}>
                <span className="lesson-ball" aria-hidden="true">⚽</span>
                <div>
                  <b>{lessonTime(l)}</b>
                  <small>{l.name}</small>
                </div>
                {same(l, nextLesson) && <span className="pill">القادم</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">لا توجد دروس بعد</p>
        )}
      </section>

      <section className="panel">
        <h2 className="panel-title">حضوري</h2>
        <div className="chips">
          <div className="chip chip-rate">
            <b>{attendanceLabel(att.rate)}</b>
            <span>الحضور</span>
          </div>
          <div className="chip chip-bad">
            <b>{att.absent ?? 0}</b>
            <span>غياب</span>
          </div>
          <div className="chip chip-late">
            <b>{att.late ?? 0}</b>
            <span>تأخير</span>
          </div>
        </div>
        {history.length ? (
          <ul className="history">
            {history.map((h, i) => (
              <li key={i} className={STATUS_CLASS[h.status] || ""}>
                <i aria-hidden="true" />
                <span>{historyLabel(h)}</span>
                <small>{h.lessonName}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">لا يوجد سجل حضور بعد</p>
        )}
      </section>
    </>
  );
}
