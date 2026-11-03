// Day 1 = الأحد … 7 = السبت, like Lesson.date.day on the server.
export const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const pad = (n) => String(n).padStart(2, "0");
const dayName = (day) => DAY_NAMES[(Number(day) - 1 + 7) % 7] || "";
const clock = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

// «الأحد 17:00–18:30»
export function lessonTime({ day, startMin, endMin }) {
  return `${dayName(day)} ${clock(startMin)}–${clock(endMin)}`;
}

// «الأحد 25/10 · حاضر» from a "YYYY-MM-DD" date. UTC math keeps the weekday right in any time zone.
export function historyLabel({ date, status }) {
  const [y, m, d] = String(date).split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return `${DAY_NAMES[weekday]} ${d}/${m} · ${status}`;
}

export function attendanceLabel(value) {
  return value === null || value === undefined ? "—" : `${value}%`;
}

// Cells on the front of the card: attendance, lateness, then up to 4 stats in order.
export function cardCells(card) {
  const att = card?.attendance || {};
  const cells = [
    { label: "الحضور", value: attendanceLabel(att.rate) },
    { label: "التأخير", value: String(att.late ?? 0) },
  ];
  for (const s of (card?.statDefs || []).slice(0, 4)) {
    cells.push({ label: s.label, value: String(card.values?.[s.key] ?? 0) });
  }
  return cells;
}

// «اليوم 17:00», «غدًا 17:00» or «الأربعاء 17:00», using the device's local time.
export function nextLessonLabel(lesson, now) {
  const today = now.getDay() + 1;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let diff = (lesson.day - today + 7) % 7;
  if (diff === 0 && lesson.startMin < nowMin) diff = 7;
  const time = clock(lesson.startMin);
  if (diff === 0) return `اليوم ${time}`;
  if (diff === 1) return `غدًا ${time}`;
  return `${dayName(lesson.day)} ${time}`;
}

// «الأحد، الأربعاء»: each lesson day once, in week order.
export function lessonDays(lessons) {
  const days = [...new Set((lessons || []).map((l) => l.day))].sort((a, b) => a - b);
  return days.length ? days.map(dayName).join("، ") : "—";
}

// "2015-05-10" -> «10/05/2015».
export function birthDateLabel(iso) {
  if (!iso) return "—";
  const [y, m, d] = String(iso).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "—";
}
