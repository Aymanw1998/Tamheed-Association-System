import React, { useEffect, useState } from "react";
import styles from "./Display.module.css";
import { DAY_NAMES, byDay, markDay } from "./displayBoard";
import { roomColumns } from "./roomBoard";
import TimeGrid from "./TimeGrid";

const DAY_MS = 15000;
const DAYS = [1, 2, 3, 4, 5, 6, 7];

// C. Day by day (owner, 2026-11-12): every day from Sunday to Saturday in
// turn, starting on today, 15 seconds each, a day with no lessons included.
// Each day is a rooms board: every room a column, hours down the side.
export default function RotateLayout({ lessons, today, minute }) {
  const grouped = byDay(lessons);
  const order = DAYS.map((_, i) => ((today - 1 + i) % 7) + 1);
  const [index, setIndex] = useState(0);
  const hasAny = DAYS.some((day) => grouped[day].length);

  useEffect(() => { setIndex(0); }, [today]);
  useEffect(() => {
    if (!hasAny) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % 7), DAY_MS);
    return () => clearInterval(id);
  }, [hasAny, today]);

  if (!hasAny) return <div className={`${styles.center} ${styles.muted}`}>لا برامج هذا الأسبوع</div>;
  const day = order[index % 7];
  const isToday = day === today;
  const list = isToday ? markDay(grouped[day], minute) : grouped[day];
  return (
    <div className={styles.rot}>
      <div className={styles.rotHead}>
        <div className={styles.rotDay} key={day} data-testid="display-rotate-day">{DAY_NAMES[day - 1]}{isToday ? " · اليوم" : ""}</div>
        <div className={styles.dots}>
          {DAYS.map((d) => <span key={d} data-testid="display-rotate-dot" data-on={d === day ? "true" : "false"}>{DAY_NAMES[d - 1]}</span>)}
        </div>
      </div>
      <div className={styles.gridBox} key={`day-${day}`}>
        {list.length
          ? <TimeGrid columns={roomColumns(list)} minute={minute} follow={isToday} nowIn={isToday ? "all" : null} />
          : <div className={`${styles.center} ${styles.muted}`}>لا برامج في هذا اليوم</div>}
      </div>
      <div className={styles.bar}><i key={`${day}-${index}`} className={styles.barFill} /></div>
    </div>
  );
}
