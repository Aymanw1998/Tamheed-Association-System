// Attendance values shared by the attendance controller and the alert job.
// The nightly job (runDailyAbsenceJob, 23:59) marks every student without a
// row as absent. Those rows carry auto: true; a teacher's save sets
// auto: false. Rows written before the marker existed are recognised by the
// note the nightly job always wrote (and only while no save has set `auto`).
const ABSENT_STATUS = "غائب";
const AUTO_ABSENCE_NOTE = "تم التحديد تلقائيًا كغائب لعدم تسجيل الحضور";

function isAutoAbsence(row = {}) {
  if (row.auto === true) return true;
  if (row.auto === false) return false;
  return row.status === ABSENT_STATUS && row.notes === AUTO_ABSENCE_NOTE;
}

// A sheet's version (what bulk-save compares baseVersion with): the newest
// updatedAt among the rows a person saved. Rows the system writes (the nightly
// absences, the empty rows a sheet view adds for new roster students) leave it
// as it is. A sheet nobody saved yet is EMPTY_SHEET_VERSION, so a save based
// on it (e.g. queued offline) is stale once anyone saves the sheet.
const EMPTY_SHEET_VERSION = new Date(0).toISOString();
const savedByPerson = (row = {}) => row.auto === false || Boolean(row.updatedBy);

// { version: ISO string, last: the newest row a person saved (or null) }
function sheetVersion(rows = []) {
  let last = null;
  for (const row of rows) {
    if (!savedByPerson(row) || !row.updatedAt) continue;
    if (!last || new Date(row.updatedAt).getTime() > new Date(last.updatedAt).getTime()) last = row;
  }
  return { version: last ? new Date(last.updatedAt).toISOString() : EMPTY_SHEET_VERSION, last };
}

module.exports = { ABSENT_STATUS, AUTO_ABSENCE_NOTE, EMPTY_SHEET_VERSION, isAutoAbsence, sheetVersion };
