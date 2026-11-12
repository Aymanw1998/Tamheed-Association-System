import React from "react";
import { roomLabel } from "../../utils/rooms";

// Small pieces shared by the wall layouts.
const pad = (n) => (n < 10 ? `0${n}` : String(n));
export const hhmm = (minutes) => {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
};
export const timeRange = (lesson) => `${hhmm(lesson.startMin)}–${hhmm(lesson.endMin)}`;

// The room as the System names it; nothing when the lesson has no room.
export const roomText = (room) => {
  if (room == null || String(room).trim() === "" || String(room) === "0") return "";
  return Number(room) ? roomLabel(room) : String(room);
};

// Times read left to right inside the right-to-left board.
export function Time({ lesson, className }) {
  return <bdi dir="ltr" className={className}>{timeRange(lesson)}</bdi>;
}

export function StateTag({ state, className }) {
  if (state === "now") return <span className={className} data-tag="now">الآن</span>;
  if (state === "next") return <span className={className} data-tag="next">التالي</span>;
  return null;
}

export function Guide({ guide, className }) {
  return guide ? <span className={className} data-testid="display-guide">{guide}</span> : null;
}
