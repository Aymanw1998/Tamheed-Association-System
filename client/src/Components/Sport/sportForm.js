import { sportStrings } from "../../i18n/sportStrings";

const v = sportStrings.ar.validation;
export const MAX_STATS = 4;

// Returns { [index | "list"]: arabicMessage }; an empty object means valid.
export const validateStats = (stats) => {
  const list = Array.isArray(stats) ? stats : [];
  const errors = {};
  if (list.length > MAX_STATS) errors.list = v.tooManyStats;
  list.forEach((s, i) => {
    if (!String(s?.label ?? "").trim()) errors[i] = v.blankStat;
  });
  return errors;
};

// Blank (no number) or a whole number from 1 to 99.
export const validateJersey = (value) => {
  const raw = String(value ?? "").trim();
  if (raw === "") return null;
  if (!/^\d+$/.test(raw)) return v.jersey;
  const n = Number(raw);
  return n >= 1 && n <= 99 ? null : v.jersey;
};

// "من" and "إلى" are required and "إلى" must be after "من" (HH:MM strings).
export const validateLessonTimes = (start, end) => {
  if (!start || !end) return v.timesRequired;
  return String(end) > String(start) ? null : v.endAfterStart;
};

// "YYYY-MM-DD" -> «DD/MM/YYYY», or "—".
export const birthDateLabel = (iso) => {
  const [y, m, d] = String(iso || "").split("-");
  return y && m && d ? `${d}/${m}/${y}` : "—";
};

// Front-of-card cells: attendance %, lates, then up to 4 stats in order.
export const cardCells = (player, statDefs, labels) => {
  const att = player?.attendance || {};
  const cells = [
    { label: labels.attendance, value: att.rate === null || att.rate === undefined ? "—" : `${att.rate}%` },
    { label: labels.lates, value: String(att.late ?? 0) },
  ];
  for (const s of (statDefs || []).slice(0, 4)) cells.push({ label: s.label, value: String(player?.values?.[s.key] ?? 0) });
  return cells;
};

// Names of the lesson days of a player, each once, in week order.
export const lessonDaysLabel = (lessons, dayNames) => {
  const days = [...new Set((lessons || []).map((l) => l.day).filter(Boolean))].sort((a, b) => a - b);
  return days.length ? days.map((d) => dayNames[d - 1]).join("، ") : "—";
};
