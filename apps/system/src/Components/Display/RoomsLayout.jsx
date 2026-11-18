import React from "react";
import styles from "./Display.module.css";
import { DAY_NAMES, byDay, markDay } from "./displayBoard";
import { boardDay, roomColumns } from "./roomBoard";
import TimeGrid from "./TimeGrid";

// D. Today by room (owner, 2026-11-12): every room is a column, hours run
// down the side, each lesson is a block at its room and hours. A long day
// moves down with the clock; after the last lesson the board shows the next
// day with lessons (see boardDay).
// A day with no lessons at all says so (owner, 2026-11-16): «لا برامج اليوم»,
// and names the next day that has a program.
export default function RoomsLayout({ lessons, today, minute }) {
  const board = boardDay(lessons, today, minute);
  if (!(byDay(lessons)[today] || []).length) {
    return (
      <div className={`${styles.center} ${styles.muted}`} data-testid="display-no-lessons-today">
        <div>
          <div>لا برامج اليوم</div>
          {board ? <div className={styles.nextDay}>{board.ahead === 1 ? "البرنامج القادم: غدًا" : `البرنامج القادم: يوم ${DAY_NAMES[board.day - 1]}`}</div> : null}
        </div>
      </div>
    );
  }
  const live = board.ahead === 0;
  const marked = markDay(board.lessons, live ? minute : -1);
  return (
    <div className={styles.gridBox} key={`${board.day}-${board.ahead}`} data-ahead={board.ahead}>
      <TimeGrid columns={roomColumns(marked)} minute={minute} follow={live} nowIn={live ? "all" : null} />
    </div>
  );
}
