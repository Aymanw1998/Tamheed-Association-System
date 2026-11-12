// Wall display board logic (owner, 2026-11-12). Pure functions: which day it
// is in Israel, what runs now and next, which days to show, and the copy of
// the last program kept on the TV. Runs on Android TV WebView, so it sticks
// to long-supported APIs (no structuredClone, Array.prototype.at, Object.hasOwn).

export const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const DAYS = [1, 2, 3, 4, 5, 6, 7];
const WEEKDAY = { Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6, Sat: 7 };
const STORE_KEY = "tamheed_display_feed_v1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

let formatter = null;
const israelFormatter = () => {
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
  }
  return formatter;
};

// How far the TV clock is behind the server (add it to Date.now()).
export function clockOffset(serverTimeIso, localNowMs) {
  const server = Date.parse(serverTimeIso);
  return Number.isFinite(server) && Number.isFinite(localNowMs) ? server - localNowMs : 0;
}

export function israelDayMinute(ms) {
  const parts = {};
  israelFormatter().formatToParts(new Date(ms)).forEach((part) => { parts[part.type] = part.value; });
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  return {
    day: WEEKDAY[parts.weekday] || 1,
    minute: hour * 60 + minute,
    date: `${parts.day}/${parts.month}/${parts.year}`,
    time: `${String(hour).padStart(2, "0")}:${parts.minute}`,
  };
}

export function byDay(lessons) {
  const grouped = {};
  DAYS.forEach((day) => { grouped[day] = []; });
  (Array.isArray(lessons) ? lessons : []).forEach((lesson) => {
    if (grouped[lesson && lesson.day]) grouped[lesson.day].push(lesson);
  });
  DAYS.forEach((day) => { grouped[day].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin); });
  return grouped;
}

// Every lesson running now is "now"; every lesson with the earliest start
// still to come is "next".
export function markDay(dayLessons, minute) {
  const list = Array.isArray(dayLessons) ? dayLessons : [];
  let nextStart = null;
  list.forEach((l) => { if (l.startMin > minute && (nextStart === null || l.startMin < nextStart)) nextStart = l.startMin; });
  return list.map((l) => {
    let state = "later";
    if (l.endMin <= minute) state = "past";
    else if (l.startMin <= minute) state = "now";
    else if (l.startMin === nextStart) state = "next";
    return Object.assign({}, l, { state });
  });
}

export const weekDays = (grouped) => DAYS.filter((day) => day <= 5 || (grouped[day] && grouped[day].length));

const following = (today) => DAYS.map((_, i) => ((today - 1 + i) % 7) + 1);

export const comingDays = (grouped, today) => following(today).slice(1)
  .filter((day) => grouped[day] && grouped[day].length)
  .map((day) => ({ day, lessons: grouped[day] }));

export const rotationDays = (grouped, today) => following(today).filter((day) => grouped[day] && grouped[day].length);

// The copy kept on the TV belongs to one screen link. Only a short
// fingerprint of the link is stored, never the link itself.
function linkPrint(token) {
  let a = 5381;
  let b = 52711;
  const text = String(token || "");
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    a = ((a * 33) ^ c) >>> 0;
    b = ((b * 31) + c) >>> 0;
  }
  return a.toString(16) + b.toString(16);
}

function readStore() {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function saveFeed(feed, nowMs, token) {
  try { window.localStorage.setItem(STORE_KEY, JSON.stringify({ savedAt: nowMs, link: linkPrint(token), feed })); } catch (e) { /* storage off: live data only */ }
}

// { feed, savedAt } for this link, or null when there is none, it belongs to
// another link, or it is older than 7 days.
export function loadStored(nowMs, token) {
  const stored = readStore();
  if (!stored || !stored.feed || !Array.isArray(stored.feed.lessons)) return null;
  if (stored.link !== linkPrint(token)) return null;
  if (!(nowMs - stored.savedAt <= MAX_AGE_MS)) return null;
  return { feed: stored.feed, savedAt: stored.savedAt };
}

export function loadFeed(nowMs, token) {
  const stored = loadStored(nowMs, token);
  return stored ? stored.feed : null;
}

// Removes the copy only when it belongs to this link.
export function clearFeed(token) {
  const stored = readStore();
  if (stored && stored.link !== linkPrint(token)) return;
  try { window.localStorage.removeItem(STORE_KEY); } catch (e) { /* nothing to clear */ }
}
