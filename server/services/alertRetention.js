// How long an alert stays in a user's inbox (owner, 2026-11-02). Each row
// carries expireAt; the TTL index on it (Alert.model) deletes the row then,
// and a row without one stays.
//   raised, unread   180 days, except a parent's registration request and the
//                    vehicle licence/test/insurance alerts: no limit
//   read             30 days after it was read, except the vehicle alerts,
//                    which stay until the renewal removes them (vehicleAlertSync)
// A record's alerts go when the record is deleted (recordPrefixes).
const DAY_MS = 24 * 60 * 60 * 1000;
const UNREAD_KEEP_DAYS = 180;
const READ_KEEP_DAYS = 30;

const VEHICLE_TYPES = new Set(["vehicle_license", "vehicle_test", "vehicle_insurance"]);
const UNTIL_OPENED = new Set(["parent_registration", ...VEHICLE_TYPES]);

const later = (from, days) => new Date(new Date(from).getTime() + days * DAY_MS);

const expiryOnRaise = (type, at = new Date()) => (UNTIL_OPENED.has(type) ? null : later(at, UNREAD_KEEP_DAYS));
const expiryOnRead = (type, at = new Date()) => (VEHICLE_TYPES.has(type) ? null : later(at, READ_KEEP_DAYS));

// The dedupKey starts of the alerts about one record (see the keys built in
// alertJob, alertEvents and vehicleNotices).
function recordPrefixes(kind, id) {
  const key = String(id ?? "").trim();
  if (!key) return [];
  switch (kind) {
    case "vehicle": return [`vehicle:${key}:`];
    case "student": return [`absence_streak:${key}:`, `parent_registration:${key}`];
    case "lesson": return [`lesson_no_attendance:${key}:`];
    case "user": return [
      `user_waiting:${key}:`, `account_locked:${key}:`, `access_changed:role:${key}:`, `access_changed:permissions:${key}:`,
    ];
    default: return [];
  }
}

const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const prefixPattern = (prefix) => `^${escapeRegex(prefix)}`;

module.exports = {
  READ_KEEP_DAYS, UNREAD_KEEP_DAYS, VEHICLE_TYPES, expiryOnRaise, expiryOnRead, recordPrefixes, prefixPattern,
};
