// Rows for the A4 print-outs (owner, 2026-11-16): the week's program and a
// program's student list. Plain data, so the PDF code stays a renderer.
const DAY_NAMES = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const hhmm = (min) => {
  const m = Math.max(0, Math.min(Number(min) || 0, 24 * 60));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const startOf = (l) => l?.date?.startMin ?? ((l?.date?.hh ?? 8) * 60);
const endOf = (l) => l?.date?.endMin ?? (startOf(l) + 45);

// Sunday to Saturday, then by start time: day, time, program, room, guide.
export function weeklyProgramRows(lessons, { teacherName = () => "", roomName = (room) => String(room ?? "") } = {}) {
  return [...(lessons || [])]
    .filter((l) => Number(l?.date?.day) >= 1 && Number(l?.date?.day) <= 7)
    .sort((a, b) => Number(a.date.day) - Number(b.date.day) || startOf(a) - startOf(b) || String(a.name || "").localeCompare(String(b.name || "")))
    .map((l) => [DAY_NAMES[Number(l.date.day) - 1], `${hhmm(startOf(l))}–${hhmm(endOf(l))}`, l.name || "", roomName(l.room), teacherName(l) || ""]);
}

// The program's students by name: #, name, class, school. No phones or ids.
export function rosterRows(lesson, students) {
  const ids = new Set((lesson?.list_students || []).map(String));
  return (students || [])
    .filter((s) => ids.has(String(s._id)))
    .map((s) => [`${s.firstname || ""} ${s.lastname || ""}`.trim(), s.layer || "", s.school || ""])
    .sort((a, b) => a[0].localeCompare(b[0], "ar"))
    .map((row, i) => [String(i + 1), ...row]);
}
