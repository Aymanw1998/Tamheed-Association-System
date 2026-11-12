import React from "react";
import styles from "./Display.module.css";
import { DAY_NAMES, byDay, comingDays, markDay } from "./displayBoard";
import { hhmm } from "./displayParts";
import TimeGrid from "./TimeGrid";

// B. Today large, as a timetable (owner, 2026-11-12): today's lessons at
// their hours in one wide column (room and guide on each; finished dimmed,
// «الآن», «التالي», the red now line), moving with the clock on a long day,
// and a one-line summary of each coming day on the side: its first three
// lessons and how many more, so a busy week is never cut off unseen.
const SIDE_LESSONS = 3;
export default function TodayLayout({ lessons, today, minute }) {
  const grouped = byDay(lessons);
  const rows = markDay(grouped[today] || [], minute);
  const coming = comingDays(grouped, today);
  return (
    <div className={styles.split}>
      <div className={styles.todayBox}>
        {rows.length ? (
          <TimeGrid
            columns={[{ key: "today", label: `اليوم – ${DAY_NAMES[today - 1]}`, lessons: rows }]}
            minute={minute} follow nowIn="all" showRoom
          />
        ) : <div className={`${styles.center} ${styles.muted}`}>لا برامج اليوم</div>}
      </div>
      <aside className={styles.side} data-testid="display-coming">
        <div className={styles.sideTitle}>الأيام القادمة</div>
        {coming.map(({ day, lessons: list }) => (
          <div key={day} className={styles.sideDay} data-testid="display-coming-day">
            <b>
              {DAY_NAMES[day - 1]}
              {list.length > SIDE_LESSONS ? <span className={styles.sideMore} dir="ltr">{`+${list.length - SIDE_LESSONS}`}</span> : null}
            </b>
            <span className={styles.sideLine}>
              {list.slice(0, SIDE_LESSONS).map((l, i) => (
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
