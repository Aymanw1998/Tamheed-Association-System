// The rooms board (owner, 2026-11-12): pure logic for which day the board
// shows, its room columns, the hours on screen and side-by-side lessons.
// Runs on Android TV WebView, so it sticks to long-supported APIs.
import { DAY_NAMES, byDay } from "./displayBoard";
import { roomLabel } from "../../utils/rooms";

const FIT_WHOLE = 5 * 60; // a day this long or shorter fits on one screen
const WINDOW = 4 * 60; // otherwise 4 hours are shown…
const BACK = 60; // …1 hour back from now and 3 ahead

// Today while one of its lessons has not ended; otherwise the next day that
// has lessons. The program repeats weekly, so when today is the only day
// with lessons and they have ended, it is the same weekday next week
// (ahead 7). Null when the program has no lessons at all.
export function boardDay(lessons, today, minute) {
  const grouped = byDay(lessons);
  const todays = grouped[today] || [];
  if (todays.some((l) => l.endMin > minute)) return { day: today, ahead: 0, lessons: todays };
  for (let ahead = 1; ahead <= 7; ahead += 1) {
    const day = ((today - 1 + ahead) % 7) + 1;
    if (grouped[day].length) return { day, ahead, lessons: grouped[day] };
  }
  return null;
}

export function boardTitle(board) {
  if (board.ahead === 0) return "برنامج اليوم";
  if (board.ahead === 1) return "برنامج الغد";
  return `برنامج يوم ${DAY_NAMES[board.day - 1]}`;
}

function roomKey(room) {
  const text = room == null ? "" : String(room).trim();
  if (!text || text === "0") return { group: 2, order: 0, key: "none", label: "بدون غرفة" };
  const n = Number(text);
  if (Number.isInteger(n) && n > 0) return { group: 0, order: n, key: `n${n}`, label: roomLabel(n) };
  return { group: 1, order: 0, key: `t${text}`, label: text };
}

// Only rooms with lessons: numbered rooms in order, then rooms stored as
// text, then «بدون غرفة».
export function roomColumns(lessons) {
  const map = {};
  const cols = [];
  (Array.isArray(lessons) ? lessons : []).forEach((lesson) => {
    const k = roomKey(lesson.room);
    if (!map[k.key]) {
      map[k.key] = { key: k.key, label: k.label, group: k.group, order: k.order, lessons: [] };
      cols.push(map[k.key]);
    }
    map[k.key].lessons.push(lesson);
  });
  cols.sort((a, b) => a.group - b.group || a.order - b.order || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  cols.forEach((c) => { c.lessons.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin); });
  return cols.map((c) => ({ key: c.key, label: c.label, lessons: c.lessons }));
}

// From the first start, rounded down to the half hour, to the last end.
export function hourRange(lessons) {
  let from = Infinity;
  let to = -Infinity;
  lessons.forEach((l) => { from = Math.min(from, l.startMin); to = Math.max(to, l.endMin); });
  return { from: Math.floor(from / 30) * 30, to };
}

// The hours on screen. A coming day (live false) and a short day fit whole;
// a long day today shows 4 hours around now, never past its first or last hour.
export function viewWindow(range, minute, live) {
  if (!live || range.to - range.from <= FIT_WHOLE) return { from: range.from, to: range.to };
  const from = Math.min(Math.max(minute - BACK, range.from), range.to - WINDOW);
  return { from, to: from + WINDOW };
}

// Lessons of one room that overlap stand side by side: each gets a lane and
// the number of lanes in its group of overlapping lessons.
export function lanes(roomLessons) {
  const sorted = roomLessons.slice().sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const out = [];
  let group = [];
  let laneEnds = [];
  let groupEnd = -Infinity;
  const close = () => { group.forEach((item) => { item.laneCount = laneEnds.length; }); group = []; laneEnds = []; };
  sorted.forEach((lesson) => {
    if (lesson.startMin >= groupEnd) close();
    let lane = laneEnds.findIndex((end) => end <= lesson.startMin);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(lesson.endMin); } else laneEnds[lane] = lesson.endMin;
    groupEnd = group.length ? Math.max(groupEnd, lesson.endMin) : lesson.endMin;
    const item = Object.assign({}, lesson, { lane, laneCount: 1 });
    group.push(item);
    out.push(item);
  });
  close();
  return out;
}
