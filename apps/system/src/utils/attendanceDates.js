import { DAY_NAMES } from "./lessonSchedule";

// "السبت 26/09/2026" for an attendance date from GET /attendance/dates.
export const attendanceDateLabel = (date) => {
  const { year, month, day, ymd } = date || {};
  if (!year || !month || !day) return ymd || "";
  const weekday = DAY_NAMES[new Date(year, month - 1, day).getDay()];
  return `${weekday} ${ymd}`;
};
