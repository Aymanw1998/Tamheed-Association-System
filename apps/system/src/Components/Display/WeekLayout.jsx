import React, { useRef } from "react";
import styles from "./Display.module.css";
import { DAY_NAMES, byDay, markDay, weekDays } from "./displayBoard";
import { Guide, Meta, StateTag, density, useFit } from "./displayParts";

const SPLIT_AT = 10; // a day with more lessons lists them in two columns

// A. The whole week: a column per day, today outlined, the running lesson
// highlighted. Every lesson stays on screen; a busy week gets smaller text.
export default function WeekLayout({ lessons, today, minute }) {
  const grouped = byDay(lessons);
  const days = weekDays(grouped);
  const rowsOf = (n) => (n > SPLIT_AT ? Math.ceil(n / 2) : n);
  const busiest = Math.max(0, ...days.map((day) => rowsOf(grouped[day].length)));
  const root = useRef(null);
  useFit(root);
  return (
    <div ref={root} className={styles.week} data-density={density(busiest, [4, 7, 10])} style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
      {days.map((day) => {
        const isToday = day === today;
        const list = isToday ? markDay(grouped[day], minute) : grouped[day];
        return (
          <section key={day} className={styles.day} data-today={isToday ? "true" : "false"}>
            <div className={styles.dayHead}>
              <span>{DAY_NAMES[day - 1]}</span>
              {isToday ? <span className={styles.todayMark}>اليوم</span> : null}
            </div>
            <div className={styles.dayList} data-fit="" data-split={list.length > SPLIT_AT ? "true" : "false"}>
            {list.length ? list.map((lesson, i) => (
              <div key={i} className={styles.lesson} data-state={lesson.state || "day"}>
                <div><span className={styles.name}>{lesson.name}</span><StateTag state={lesson.state} className={styles.tag} /></div>
                <Meta lesson={lesson} className={styles.meta} />
                <Guide guide={lesson.guide} className={styles.guide} />
              </div>
            )) : <div className={styles.empty}>لا برامج</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
