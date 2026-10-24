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
