// Helpers shared by the assistant's tools. Every tool gets a `ctx`:
//   ctx.actor     req.actor (permissions Set, id, tz, name, role, isSystem)
//   ctx.models    { Student, Lesson, Attendance, Report, User, Vehicle } (api.js model defs)
//   ctx.now       the time of the call
//   ctx.can(key)  can(actor, key)
//   ctx.visible() student scope: null (all) or a Set of student _id strings
//   ctx.users()   Map of active user _id -> { name, tz }, the system account left out
//   ctx.isSystemTz(tz)
const { Types } = require("mongoose");

const FORBIDDEN = Object.freeze({ error: "FORBIDDEN" });
const NOT_FOUND = Object.freeze({ error: "NOT_FOUND" });
const invalid = (message) => ({ error: "INVALID_INPUT", message });

const OBJECT_ID = "^[0-9a-fA-F]{24}$";
const OBJECT_ID_RE = new RegExp(OBJECT_ID);
// A 24-hex id may be stored as a string or as an ObjectId; match both.
const idMatch = (id) => (OBJECT_ID_RE.test(String(id)) ? { $in: [String(id), new Types.ObjectId(String(id))] } : String(id));

const TIME_ZONE = "Asia/Jerusalem";
const pad = (n) => String(n).padStart(2, "0");

// "YYYY-MM-DD" of `value` on the Jerusalem calendar ("" for no date).
function jerusalemDate(value) {
  if (value == null || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const toUtc = (date) => { const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fromUtc = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const addDays = (date, days) => { const d = toUtc(date); d.setUTCDate(d.getUTCDate() + days); return fromUtc(d); };
const daysBetween = (from, to) => Math.round((toUtc(to) - toUtc(from)) / (24 * 60 * 60 * 1000));
const dateKeyOf = (date) => Number(date.replace(/-/g, ""));
const dateOfKey = (key) => { const s = String(key); return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`; };
// Lessons store the weekday as 1-7, Sunday = 1.
const weekdayOf = (date) => toUtc(date).getUTCDay() + 1;
const hhmm = (min) => (Number.isFinite(Number(min)) ? `${pad(Math.floor(Number(min) / 60))}:${pad(Number(min) % 60)}` : "");

const fullName = (p = {}) => [p.firstname, p.lastname].filter(Boolean).join(" ").trim();
const rows = (res) => (Array.isArray(res?.result) ? res.result : []);
const clip = (text, max) => { const s = String(text ?? ""); return s.length > max ? `${s.slice(0, max)}…` : s; };
const byName = (a, b) => String(a.name).localeCompare(String(b.name));

// Attendance status -> summary bucket.
const STATUS_BUCKET = { "حاضر": "present", "غائب": "absent", "متأخر": "late" };
const bucketOf = (status) => STATUS_BUCKET[status] || "other";

module.exports = {
  FORBIDDEN, NOT_FOUND, invalid,
  OBJECT_ID, OBJECT_ID_RE, idMatch,
  jerusalemDate, addDays, daysBetween, dateKeyOf, dateOfKey, weekdayOf, hhmm,
  fullName, rows, clip, byName, bucketOf,
};
