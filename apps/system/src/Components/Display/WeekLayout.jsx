import React from "react";
import styles from "./Display.module.css";
import { DAY_NAMES, byDay, markDay } from "./displayBoard";
import TimeGrid from "./TimeGrid";

const DAYS = [1, 2, 3, 4, 5, 6, 7];

// A. The whole week as a timetable (owner, 2026-11-12): a column for every
// day, Sunday to Saturday, even a day with no lessons; hours down the side;
// each lesson at its time with its room. Today's column is marked and only
// it carries «الآن», «التالي» and the red now line.
export default function WeekLayout({ lessons, today, minute }) {
  const grouped = byDay(lessons);
  if (!DAYS.some((day) => grouped[day].length)) return <div className={`${styles.center} ${styles.muted}`}>لا برامج هذا الأسبوع</div>;
  const columns = DAYS.map((day) => ({
    key: String(day),
    label: DAY_NAMES[day - 1],
    today: day === today,
    lessons: day === today ? markDay(grouped[day], minute) : grouped[day],
  }));
  return (
    <div className={styles.gridBox}>
      <TimeGrid columns={columns} minute={minute} follow={false} nowIn={String(today)} showRoom wideToday />
    </div>
  );
}
