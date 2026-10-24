const weekdayFormat = new Intl.DateTimeFormat("ar-u-nu-latn", { weekday: "long" });

const pad = (n) => String(n).padStart(2, "0");
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function formatTrainingDate(iso, now) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const days = Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
  if (days === 0) return `اليوم ${time}`;
  if (days === 1) return `غدًا ${time}`;
  return `${weekdayFormat.format(d)} ${d.getDate()}/${d.getMonth() + 1} · ${time}`;
}

export function attendanceLabel(value) {
  return value === null || value === undefined ? "—" : `${value}%`;
}

// Cells of the stat grid: matches, attendance, then up to 4 sport stats in order.
export function statCells(card) {
  const cells = [
    { label: "مباريات", value: String(card.stats?.matches ?? 0) },
    { label: "الحضور", value: attendanceLabel(card.stats?.attendance) },
  ];
  for (const s of (card.sport?.stats || []).slice(0, 4)) {
    cells.push({ label: s.label, value: String(card.stats?.values?.[s.key] ?? 0) });
  }
  return cells;
}

// The line under the name, like «11 سنة · مهاجم»: each part only when present.
export function cardSubtitle(age, position) {
  const parts = [];
  if (age !== null && age !== undefined) parts.push(`${age} سنة`);
  if (position) parts.push(position);
  return parts.join(" · ");
}
