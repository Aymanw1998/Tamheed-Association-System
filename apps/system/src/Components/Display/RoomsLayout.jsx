import React from "react";
import styles from "./Display.module.css";
import { markDay } from "./displayBoard";
import { boardDay, roomColumns } from "./roomBoard";
import TimeGrid from "./TimeGrid";

// D. Today by room (owner, 2026-11-12): every room is a column, hours run
// down the side, each lesson is a block at its room and hours. A long day
// moves down with the clock; after the last lesson the board shows the next
// day with lessons (see boardDay).
export default function RoomsLayout({ lessons, today, minute }) {
  const board = boardDay(lessons, today, minute);
  if (!board) return <div className={`${styles.center} ${styles.muted}`}>لا برامج</div>;
  const live = board.ahead === 0;
  const marked = markDay(board.lessons, live ? minute : -1);
  return (
    <div className={styles.gridBox} key={`${board.day}-${board.ahead}`} data-ahead={board.ahead}>
      <TimeGrid columns={roomColumns(marked)} minute={minute} follow={live} nowIn={live ? "all" : null} />
    </div>
  );
}
