const ZONE = "Asia/Jerusalem";
const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/;
const displayDay = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const dateParts = new Intl.DateTimeFormat("en-GB-u-nu-latn", { timeZone: ZONE, day: "2-digit", month: "2-digit", year: "numeric" });
const clockParts = new Intl.DateTimeFormat("en-GB-u-nu-latn", { timeZone: ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function dateValue(value) { const date = value == null || value === "" ? null : new Date(value); return date && Number.isFinite(date.getTime()) ? date : null; }
function formatDate(value, fallback = "—") {
  const displayed = typeof value === "string" && value.match(displayDay);
  if (displayed) return formatDate(`${displayed[3]}-${displayed[2]}-${displayed[1]}`, fallback);
  const match = typeof value === "string" && value.match(dayOnly);
  if (match) {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? `${match[3]}/${match[2]}/${match[1]}` : fallback;
  }
  const date = dateValue(value);
  if (!date) return fallback;
  const parts = Object.fromEntries(dateParts.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.day}/${parts.month}/${parts.year}`;
}
function formatTime(value, fallback = "—") { const date = dateValue(value); return date ? clockParts.format(date) : fallback; }
function formatDateTime(value, fallback = "—") {
  const day = formatDate(value, fallback);
  return day === fallback || (typeof value === "string" && (dayOnly.test(value) || displayDay.test(value))) ? day : `${day} ${formatTime(value, fallback)}`;
}
module.exports = { formatDate, formatDateTime, formatTime };
