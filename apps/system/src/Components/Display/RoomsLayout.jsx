import React from "react";
import styles from "./Display.module.css";
import { markDay } from "./displayBoard";
import { Guide, StateTag, Time, hhmm } from "./displayParts";
import { boardDay, hourRange, lanes, roomColumns, viewWindow } from "./roomBoard";

// D. Today by room (owner, 2026-11-12): rooms are columns across the top,
// hours run down the right side, each lesson is a block at its room and
// hours. A long day moves down with the clock; after the last lesson the
// board shows the next day with lessons (see boardDay).
const pct = (n) => `${Math.round(n * 10000) / 100}%`;

// How much of the screen's height a lesson gets decides which lines fit.
const sizeOf = (share) => (share < 0.09 ? "xs" : share < 0.16 ? "sm" : "md");

export default function RoomsLayout({ lessons, today, minute }) {
  const board = boardDay(lessons, today, minute);
  if (!board) return <div className={`${styles.center} ${styles.muted}`}>لا برامج</div>;

  const live = board.ahead === 0;
  const marked = markDay(board.lessons, live ? minute : -1);
  const cols = roomColumns(marked);
  const range = hourRange(marked);
  const span = Math.max(1, range.to - range.from);
  const win = viewWindow(range, minute, live);
  const winSpan = Math.max(1, win.to - win.from);
  const at = (m) => (m - range.from) / span;
  const grid = { gridTemplateColumns: `var(--axis) repeat(${cols.length}, minmax(0, 1fr))` };
  const hours = [];
  for (let m = Math.ceil(range.from / 60) * 60; m <= range.to; m += 60) hours.push(m);
  const showNow = live && minute >= range.from && minute <= range.to;
  let order = 0;

  return (
    <div className={styles.rooms} key={`${board.day}-${board.ahead}`} data-ahead={board.ahead}>
      <div className={styles.roomHeads} style={grid}>
        <span />
        {cols.map((col, i) => (
          <div key={col.key} className={styles.roomHead} data-testid="display-room-head" style={{ "--i": i }}>{col.label}</div>
        ))}
      </div>
      <div className={styles.roomView}>
        <div
          className={styles.roomTrack}
          data-testid="display-room-track"
          data-from={win.from}
          style={{ height: pct(span / winSpan), transform: `translateY(${pct(-(win.from - range.from) / span)})` }}
        >
          <div className={styles.hourLayer} aria-hidden="true">
            {hours.map((m) => (
              <div key={m} className={styles.hourLine} style={{ top: pct(at(m)) }}>
                <bdi dir="ltr" className={styles.hourLabel} data-testid="display-hour">{hhmm(m)}</bdi>
              </div>
            ))}
            {hours.map((m) => (m + 30 < range.to && m + 30 > range.from ? <div key={`h${m}`} className={styles.halfLine} style={{ top: pct(at(m + 30)) }} /> : null))}
          </div>
          <div className={styles.roomCols} style={grid}>
            <span />
            {cols.map((col) => (
              <div key={col.key} className={styles.roomCol} data-room={col.key}>
                {lanes(col.lessons).map((lesson) => {
                  order += 1;
                  return (
                    <div
                      key={`${lesson.name}-${lesson.startMin}-${lesson.lane}`}
                      className={styles.slot}
                      data-lane={`${lesson.lane}/${lesson.laneCount}`}
                      style={{
                        top: pct(at(lesson.startMin)),
                        height: pct((lesson.endMin - lesson.startMin) / span),
                        right: pct(lesson.lane / lesson.laneCount),
                        width: pct(1 / lesson.laneCount),
                      }}
                    >
                      <div
                        className={styles.block}
                        data-testid="display-room-lesson"
                        data-state={lesson.state}
                        data-size={sizeOf((lesson.endMin - lesson.startMin) / winSpan)}
                        style={{ "--i": Math.min(order, 24) }}
                      >
                        <div className={styles.blockName}><span className={styles.name}>{lesson.name}</span><StateTag state={lesson.state} className={styles.tag} /></div>
                        <Time lesson={lesson} className={styles.blockTime} />
                        <Guide guide={lesson.guide} className={styles.guide} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {showNow ? (
            <div className={styles.nowLine} data-testid="display-now-line" style={{ top: pct(at(minute)) }}>
              <bdi dir="ltr" className={styles.nowLabel}>{hhmm(minute)}</bdi>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
