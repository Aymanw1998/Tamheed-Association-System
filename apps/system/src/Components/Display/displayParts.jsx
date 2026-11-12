import React, { useEffect, useLayoutEffect } from "react";
import { roomLabel } from "../../utils/rooms";

// Small pieces shared by the three wall layouts.
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

export function Meta({ lesson, className }) {
  const room = roomText(lesson.room);
  return <span className={className}><Time lesson={lesson} />{room ? ` · ${room}` : ""}</span>;
}

export function StateTag({ state, className }) {
  if (state === "now") return <span className={className} data-tag="now">الآن</span>;
  if (state === "next") return <span className={className} data-tag="next">التالي</span>;
  return null;
}

export function Guide({ guide, className }) {
  return guide ? <span className={className} data-testid="display-guide">{guide}</span> : null;
}

// How crowded the busiest day is, for the font size: up to limits[0]
// lessons is "roomy", then "normal", "crowded", and "packed" past limits[2].
export const density = (count, limits) => (count > limits[2] ? "packed" : count > limits[1] ? "crowded" : count > limits[0] ? "normal" : "roomy");

// Shrinks text (the --fit scale its sizes are multiplied by) until no
// [data-fit] box overflows, so a crowded day is never cut off. The board
// shares one scale; a box marked data-fit-scope (the side column of the
// "today" layout) gets its own, so it never shrinks the rest.
const FIT_FLOOR = 0.4;
function fitScope(scope, boxes) {
  const over = () => boxes.some((box) => box.scrollHeight > box.clientHeight + 1);
  let scale = 1;
  scope.style.setProperty("--fit", "1");
  while (over() && scale > FIT_FLOOR + 0.001) {
    scale = Math.max(FIT_FLOOR, Math.round((scale - 0.05) * 100) / 100);
    scope.style.setProperty("--fit", String(scale));
  }
  return scale;
}
// At the floor, a box that still overflows hides the lessons past its bottom
// and says how many with «+N», instead of cutting them off silently.
function markHidden(box) {
  const items = [].slice.call(box.children);
  items.forEach((item) => item.removeAttribute("data-cut"));
  box.removeAttribute("data-more");
  if (box.scrollHeight <= box.clientHeight + 1) return;
  const reserve = Math.round((window.innerHeight || 0) * 0.035); // room for the «+N» line
  const limit = box.getBoundingClientRect().bottom - reserve;
  const hidden = items.filter((item) => item.getBoundingClientRect().bottom > limit);
  hidden.forEach((item) => item.setAttribute("data-cut", "true"));
  if (hidden.length) box.setAttribute("data-more", `+${hidden.length}`);
}

export function fitBoard(root) {
  if (!root) return 1;
  const boxes = [].slice.call(root.querySelectorAll("[data-fit]"));
  boxes.forEach((box) => {
    [].slice.call(box.children).forEach((item) => item.removeAttribute("data-cut"));
    box.removeAttribute("data-more");
  });
  const scopeOf = (box) => (box.hasAttribute("data-fit-scope") ? box : root);
  [].slice.call(root.querySelectorAll("[data-fit-scope]")).forEach((scope) => {
    fitScope(scope, boxes.filter((box) => scopeOf(box) === scope));
  });
  const scale = fitScope(root, boxes.filter((box) => scopeOf(box) === root));
  boxes.forEach(markHidden);
  return scale;
}

// Refit after every render (the clock ticks, a new program arrives) and when
// the screen size changes.
export function useFit(ref) {
  useLayoutEffect(() => { fitBoard(ref.current); });
  useEffect(() => {
    const onResize = () => fitBoard(ref.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [ref]);
}
