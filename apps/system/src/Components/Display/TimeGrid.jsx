import React from "react";
import styles from "./Display.module.css";
import { Guide, StateTag, Time, hhmm, roomText } from "./displayParts";
import { hourRange, lanes, viewWindow } from "./roomBoard";

// The wall's timetable (owner, 2026-11-12): columns across the top (rooms,
// or days), hours down the right side, each lesson a block at its hours, as
// on a real schedule. Every layout draws its lessons with it.
//
// columns: [{ key, label, lessons, today }] (lessons may carry a state);
// follow: a long day shows 4 hours around `minute` and moves with it;
// nowIn: "all" (a red line across every column), a column key, or null;
// showRoom: write the room on each block (when the columns are not rooms);
// wideToday: the column marked today is twice as wide (the week).
const pct = (n) => `${Math.round(n * 10000) / 100}%`;

// The shortest block, as a share of the hours on screen: enough for the
// lesson name on one line (Codex review, 2026-11-12).
const MIN_SHARE = 0.045;

// How much of the screen's height a lesson gets decides which lines fit.
// A block narrower than this share of the board's width gets the compact
// look (name first, tag above it), so its name is not squeezed (Codex review).
const NARROW_SHARE = 0.07;

const sizeOf = (share) => (share < 0.06 ? "xxs" : share < 0.09 ? "xs" : share < 0.16 ? "sm" : "md");

function NowLine({ minute, top }) {
  return (
    <div className={styles.nowLine} data-testid="display-now-line" style={{ top }}>
      <bdi dir="ltr" className={styles.nowLabel}>{hhmm(minute)}</bdi>
    </div>
  );
}

export default function TimeGrid({ columns, minute, follow, nowIn, showRoom, wideToday }) {
  const all = [];
  columns.forEach((col) => { col.lessons.forEach((l) => all.push(l)); });
  const lessonHours = hourRange(all);
  const firstWin = viewWindow(lessonHours, minute, follow);
  const minMinutes = Math.ceil(Math.max(1, firstWin.to - firstWin.from) * MIN_SHARE);
  // The board ends where its last block is drawn, so a short last lesson is
  // not cut off at the bottom (Codex review, 2026-11-12).
  const range = { from: lessonHours.from, to: Math.max.apply(null, [lessonHours.to].concat(all.map((l) => l.startMin + minMinutes))) };
  const span = Math.max(1, range.to - range.from);
  const win = viewWindow(range, minute, follow);
  const winSpan = Math.max(1, win.to - win.from);
  const at = (m) => (m - range.from) / span;
  const weightOf = (col) => (wideToday && col.today ? 2 : 1);
  const totalWeight = columns.reduce((sum, col) => sum + weightOf(col), 0) || 1;
  const widths = wideToday && columns.some((col) => col.today)
    ? columns.map((col) => (col.today ? "minmax(0, 2fr)" : "minmax(0, 1fr)")).join(" ")
    : `repeat(${columns.length}, minmax(0, 1fr))`;
  const grid = { gridTemplateColumns: `var(--axis) ${widths}` };
  const hours = [];
  for (let m = Math.ceil(range.from / 60) * 60; m <= range.to; m += 60) hours.push(m);
  const nowShown = nowIn != null && minute >= range.from && minute <= range.to;
  let order = 0;

  return (
    <div className={styles.rooms}>
      <div className={styles.roomHeads} style={grid}>
        <span />
        {columns.map((col, i) => (
          <div key={col.key} className={styles.roomHead} data-testid="display-room-head"
            data-empty={col.lessons.length ? "false" : "true"} data-today={col.today ? "true" : "false"} style={{ "--i": i }}>
            {col.label}
          </div>
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
            {columns.map((col) => (
              <div key={col.key} className={styles.roomCol} data-room={col.key} data-today={col.today ? "true" : "false"}>
                {lanes(col.lessons, minMinutes).map((lesson) => {
                  order += 1;
                  const room = showRoom ? roomText(lesson.room) : "";
                  return (
                    <div
                      key={`${lesson.name}-${lesson.startMin}-${lesson.lane}`}
                      className={styles.slot}
                      data-lane={`${lesson.lane}/${lesson.laneCount}`}
                      style={{
                        top: pct(at(lesson.startMin)),
                        height: pct((lesson.drawnEnd - lesson.startMin) / span),
                        right: pct(lesson.lane / lesson.laneCount),
                        width: pct(1 / lesson.laneCount),
                      }}
                    >
                      <div
                        className={styles.block}
                        data-testid="display-room-lesson"
                        data-state={lesson.state || "day"}
                        data-size={sizeOf((lesson.drawnEnd - lesson.startMin) / winSpan)}
                        data-narrow={weightOf(col) / totalWeight / lesson.laneCount < NARROW_SHARE ? "true" : "false"}
                        style={{ "--i": Math.min(order, 24) }}
                      >
                        <div className={styles.blockName}>
                          <span className={styles.name}>{lesson.name}</span>
                          {room ? <span className={styles.roomInline} data-room-inline="">{` · ${room}`}</span> : null}
                          <StateTag state={lesson.state} className={styles.tag} />
                        </div>
                        <Time lesson={lesson} className={styles.blockTime} />
                        {room ? <span className={styles.blockRoom}>{room}</span> : null}
                        <Guide guide={lesson.guide} className={styles.guide} />
                      </div>
                    </div>
                  );
                })}
                {nowShown && nowIn === col.key ? <NowLine minute={minute} top={pct(at(minute))} /> : null}
              </div>
            ))}
          </div>
          {nowShown && nowIn === "all" ? <NowLine minute={minute} top={pct(at(minute))} /> : null}
        </div>
      </div>
    </div>
  );
}
