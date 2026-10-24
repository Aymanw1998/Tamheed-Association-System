const { can } = require("../utils/permissions");

// Which alert types a user may still read, judged by their permissions now
// (not when the alert was raised), so a demoted user stops seeing alerts they
// were sent under their old permissions. Used by GET /api/alerts and by the
// live stream's alert push. Types not listed here are never shown.
const always = () => true;
const isSystem = (actor) => actor?.isSystem === true;
const has = (...keys) => (actor) => keys.every((key) => can(actor, key));

const ALERT_ACCESS = {
  parent_registration: has("students.viewAll", "students.edit"),
  user_waiting: has("users.approve"),
  account_locked: (actor) => isSystem(actor) || can(actor, "users.unlock"),
  system_login_failures: isSystem,
  vehicle_license: has("vehicles.view"),
  vehicle_test: has("vehicles.view"),
  vehicle_insurance: has("vehicles.view"),
  absence_streak: has("attendance.view"),
  sport_lesson_no_attendance: (actor) => can(actor, "sports.coach") || can(actor, "sports.manage"),
  // About the user's own work or own account.
  lesson_no_attendance: always,
  report_missing: always,
  access_changed: always,
};

function canSeeAlertType(actor, type) {
  if (!actor) return false;
  const rule = Object.hasOwn(ALERT_ACCESS, type) ? ALERT_ACCESS[type] : null;
  return Boolean(rule && rule(actor));
}

const visibleAlertTypes = (actor) => Object.keys(ALERT_ACCESS).filter((type) => canSeeAlertType(actor, type));

module.exports = { ALERT_ACCESS, canSeeAlertType, visibleAlertTypes };
