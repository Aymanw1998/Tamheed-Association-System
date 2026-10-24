import { sportStrings } from "../../i18n/sportStrings";

const v = sportStrings.ar.validation;
export const MAX_STATS = 4;

// Returns { [field]: arabicMessage }; an empty object means the form is valid.
export const validateSport = ({ name, icon, stats }) => {
  const errors = {};
  if (!String(name ?? "").trim()) errors.name = v.nameRequired;
  if ([...String(icon ?? "").trim()].length > 4) errors.icon = v.iconTooLong;
  const list = Array.isArray(stats) ? stats : [];
  if (list.length > MAX_STATS) errors.stats = v.tooManyStats;
  else if (list.some((s) => !String(s?.label ?? "").trim())) errors.stats = v.blankStat;
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

// The server accepts only current team members; stale ids are dropped.
export const currentPresentIds = (training, members) => {
  const current = new Set((members || []).map((m) => String(m.studentId)));
  return (training?.presentIds || []).map(String).filter((id) => current.has(id));
};

// <input type="datetime-local"> value <-> ISO string (local time).
const pad = (n) => String(n).padStart(2, "0");
export const toLocalInput = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const fromLocalInput = (value) => {
  const d = new Date(value);
  return value && !Number.isNaN(d.getTime()) ? d.toISOString() : "";
};
