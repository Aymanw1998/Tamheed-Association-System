import React, { useRef } from "react";
import styles from "./Display.module.css";
import { DAY_NAMES, byDay, comingDays, markDay } from "./displayBoard";
import { Guide, StateTag, Time, density, hhmm, roomText, useFit } from "./displayParts";

// B. Today large: today's lessons as rows (finished dimmed, «الآن», «التالي»)
// and a one-line summary of each coming day on the side.
export default function TodayLayout({ lessons, today, minute }) {
  const grouped = byDay(lessons);
  const rows = markDay(grouped[today] || [], minute);
  const coming = comingDays(grouped, today);
  const root = useRef(null);
  useFit(root);
  return (
    <div ref={root} className={styles.split}>
      <div className={styles.todayBox}>
        <div className={styles.sectionTitle}>اليوم – {DAY_NAMES[today - 1]}</div>
        {rows.length ? (
          <div className={styles.rows} data-fit="" data-density={density(rows.length, [6, 8, 10])}>
            {rows.map((lesson, i) => (
              <div key={i} className={styles.row} data-state={lesson.state}>
                <Time lesson={lesson} className={styles.time} />
                <span>
                  <span className={styles.name}>{lesson.name}</span>
                  <StateTag state={lesson.state} className={styles.tag} />
                  <Guide guide={lesson.guide} className={styles.guide} />
                </span>
                <span className={styles.room}>{roomText(lesson.room)}</span>
              </div>
            ))}
          </div>
        ) : <div className={`${styles.center} ${styles.muted}`}>لا برامج اليوم</div>}
      </div>
      <aside className={styles.side} data-fit="" data-fit-scope="" data-testid="display-coming">
        <div className={styles.sideTitle}>الأيام القادمة</div>
        {coming.map(({ day, lessons: list }) => (
          <div key={day} className={styles.sideDay} data-testid="display-coming-day">
            <b>{DAY_NAMES[day - 1]}</b>
            <span>
              {list.map((l, i) => (
                <React.Fragment key={i}>
                  {i ? " · " : ""}
                  <span>{l.name} <bdi dir="ltr">{hhmm(l.startMin)}</bdi></span>
                </React.Fragment>
              ))}
            </span>
          </div>
        ))}
      </aside>
    </div>
  );
}
