import { isItLink } from "./siteLink";
// Pure helpers for the assistant's alerts tab.
// An alert: { id, type, severity, text: { ar, ... }, link, at, read }.

export const MAX_ALERTS = 50;

const time = (alert) => {
  const value = new Date(alert?.at).getTime();
  return Number.isNaN(value) ? 0 : value;
};

export const sortAlerts = (alerts) =>
  (Array.isArray(alerts) ? [...alerts] : []).sort((x, y) => time(y) - time(x));

export const unreadCount = (alerts) =>
  (Array.isArray(alerts) ? alerts : []).filter((alert) => alert && !alert.read).length;

// The alert's Arabic text (the server may still send other languages; they are ignored).
export const alertText = (alert) => {
  const value = alert?.text?.ar;
  return typeof value === "string" && value.trim() ? value : "";
};

// A live alert arrives: add it (or replace the same id), newest first, 50 at most.
export const mergeAlert = (alerts, incoming) => {
  const base = Array.isArray(alerts) ? alerts : [];
  if (!incoming || !incoming.id) return sortAlerts(base).slice(0, MAX_ALERTS);
  const rest = base.filter((alert) => alert.id !== incoming.id);
  return sortAlerts([incoming, ...rest]).slice(0, MAX_ALERTS);
};

// Mark one alert read, or every alert when no id is given.
export const markReadLocal = (alerts, id) =>
  (Array.isArray(alerts) ? alerts : []).map((alert) =>
    !id || alert.id === id ? { ...alert, read: true } : alert);

export const alertTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ar", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    numberingSystem: "latn",
  }).format(date);
};

export const severityClass = (severity) =>
  severity === "critical" || severity === "important" ? severity : "info";

// The stream view has no read flag (new alerts are unread); the list view has
// `read`. Accept either `read` or `readAt` and always return a boolean.
export const normalizeAlert = (alert) =>
  alert && typeof alert === "object" ? { ...alert, read: Boolean(alert.read ?? alert.readAt) } : alert;

// Fold a fetched list into the current one. Alerts newer than the newest
// fetched one arrived on the stream meanwhile and stay; an older one the
// server no longer sent was deleted there (its record went, or it expired)
// and goes. An alert already read here stays read.
export const mergeAlerts = (current, fetched) => {
  const mine = Array.isArray(current) ? current : [];
  const rows = (Array.isArray(fetched) ? fetched : []).map(normalizeAlert).filter(Boolean);
  const known = new Map(mine.map((alert) => [alert.id, alert]));
  // Nothing fetched: the server has none, so none stays.
  const newest = rows.length ? Math.max(...rows.map((alert) => new Date(alert.at).getTime()).filter((t) => !Number.isNaN(t))) : Infinity;
  const live = mine.filter((alert) => !rows.some((row) => row.id === alert.id) && new Date(alert.at).getTime() > newest);
  return rows.reduce((list, item) => {
    if (known.get(item.id)?.read) item.read = true;
    return mergeAlert(list, item);
  }, live);
};

// Only in-app routes: "/x" yes, "//host", "http://..." and "" no.
// An in-app path only: starts with one "/", no backslash, and no control or
// whitespace character (a browser strips tab/newline, so "/\t/evil.com"
// would become "//evil.com"); resolved against this origin it must stay here.
const UNSAFE_LINK_CHARS = /[\x00-\x20\x7f\\]/; // eslint-disable-line no-control-regex
const FALLBACK_ORIGIN = "http://app.invalid";

export const safeLink = (link) => {
  if (typeof link !== "string" || !link.startsWith("/") || link.startsWith("//") || UNSAFE_LINK_CHARS.test(link)) return "";
  const origin = typeof window !== "undefined" && window.location?.origin && window.location.origin !== "null"
    ? window.location.origin
    : FALLBACK_ORIGIN;
  try {
    return new URL(link, origin).origin === origin ? link : "";
  } catch {
    return "";
  }
};

// Where an alert's link goes: { path } inside the app, { external } for the
// IT site (opened in a new tab), or null for anything else.
export const alertTarget = (link) => {
  const path = safeLink(link);
  if (path) return { path };
  return isItLink(link) ? { external: link } : null;
};

// throttle(fn) runs fn unless it already ran less than `ms` ago; returns
// whether it ran. Used for the assistant's catch-up refetch on window focus.
export const createThrottle = (ms, now = () => Date.now()) => {
  let last = -Infinity;
  return (fn) => {
    const t = now();
    if (t - last < ms) return false;
    last = t;
    fn();
    return true;
  };
};
