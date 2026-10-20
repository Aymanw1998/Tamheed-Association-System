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

module.exports = { ABSENT_STATUS, AUTO_ABSENCE_NOTE, isAutoAbsence };
