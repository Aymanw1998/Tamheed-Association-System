import React, { useEffect, useRef, useState } from "react";
import styles from "./Display.module.css";
import { DAY_NAMES, byDay, markDay, rotationDays } from "./displayBoard";
import { Guide, StateTag, Time, density, roomText, useFit } from "./displayParts";

const DAY_MS = 15000;
// More lessons, more columns; the text shrinks only when the rows run out.
const columnsFor = (count) => (count > 15 ? 6 : count > 8 ? 5 : count > 3 ? 4 : 3);

// C. Day by day: one day with lessons at a time, in large cards, moving on
// every 15 seconds. Starts on today (or the next day with lessons).
export default function RotateLayout({ lessons, today, minute }) {
  const grouped = byDay(lessons);
  const days = rotationDays(grouped, today);
  const [index, setIndex] = useState(0);
  const first = days.length ? days[0] : 0;
  const count = days.length;
  const root = useRef(null);
  useFit(root);

  useEffect(() => { setIndex(0); }, [first]);
  useEffect(() => {
    if (count < 2) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), DAY_MS);
    return () => clearInterval(id);
  }, [count, first]);

  if (!count) return <div className={`${styles.center} ${styles.muted}`}>لا برامج هذا الأسبوع</div>;
  const day = days[index % count];
  const list = day === today ? markDay(grouped[day], minute) : grouped[day];
  return (
    <div ref={root} className={styles.rot}>
      <div className={styles.dots}>
        {days.map((d) => <span key={d} data-on={d === day ? "true" : "false"}>{DAY_NAMES[d - 1]}</span>)}
      </div>
      <div className={styles.rotDay} data-testid="display-rotate-day">{DAY_NAMES[day - 1]}{day === today ? " · اليوم" : ""}</div>
      <div className={styles.cards} data-fit="" data-density={density(Math.ceil(list.length / columnsFor(list.length)), [2, 3, 4])} style={{ gridTemplateColumns: `repeat(${columnsFor(list.length)}, minmax(0, 1fr))` }}>
        {list.map((lesson, i) => (
          <div key={i} className={styles.card} data-state={lesson.state || "day"}>
            <Time lesson={lesson} className={styles.time} />
            <div><span className={styles.name}>{lesson.name}</span><StateTag state={lesson.state} className={styles.tag} /></div>
            <Guide guide={lesson.guide} className={styles.guide} />
            {roomText(lesson.room) ? <span className={styles.room}>{roomText(lesson.room)}</span> : null}
          </div>
        ))}
      </div>
      {count > 1 ? <div className={styles.bar}><i key={`${day}-${index}`} className={styles.barFill} /></div> : null}
    </div>
  );
}
