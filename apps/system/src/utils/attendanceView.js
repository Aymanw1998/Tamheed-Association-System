// The student page's attendance tab: totals, months and status colours for
// rows { year, month, day, status } (the server's student.attendance).

const TONES = { "حاضر": "present", "غائب": "absent", "متأخر": "late" };
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

export const statusTone = (status) => TONES[status] || "other";

// rate: attended (present or late) out of every marked row, in whole
// percent; null when nothing is marked.
export function attendanceTotals(rows = []) {
  const count = (tone) => rows.filter((r) => statusTone(r.status) === tone).length;
  const present = count("present");
  const late = count("late");
  const absent = count("absent");
  const total = rows.length;
  return { total, present, late, absent, rate: total ? Math.round(((present + late) / total) * 100) : null };
}

const keyOf = (r) => `${r.year}-${String(r.month).padStart(2, "0")}`;

export const monthKeys = (rows = []) => [...new Set(rows.map(keyOf))].sort().reverse();

export const inMonth = (rows = [], key = "all") => (key === "all" ? rows : rows.filter((r) => keyOf(r) === key));

export function monthLabel(key) {
  const [year, month] = String(key).split("-").map(Number);
  return `${MONTHS[month - 1] || ""} ${year}`.trim();
}
