// Who may record attendance on a program (owner, 2026-11-19; spec
// docs/superpowers/specs/2026-11-19-student-to-staff-design.md, decision 7):
// a holder of attendance.record (as before), or the program's «المسؤول»
// (its teacher) with attendance.view, so an assistant in charge records his
// own programs only. A revoke of attendance.record, or of the whole
// attendance module, takes it away again. One rule for saving, the sheet lock
// (acquire and heartbeat) and the client.
const { can, expandKeys } = require("./permissions");

const revokedRecord = (actor) => {
  const revokes = Array.isArray(actor?.revokes) ? actor.revokes : actor?.user?.permissionRevokes;
  return expandKeys(Array.isArray(revokes) ? revokes : []).has("attendance.record");
};

const isInChargeOf = (actor, lesson) => {
  const me = String(actor?.id ?? "");
  return Boolean(me) && lesson?.teacher != null && String(lesson.teacher) === me;
};

function mayRecordAttendance(actor, lesson) {
  if (can(actor, "attendance.record")) return true;
  return isInChargeOf(actor, lesson) && can(actor, "attendance.view") && !revokedRecord(actor);
}

// Reads the program by id; null when missing. Throws on a failed read.
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
async function readLesson(lessons, lessonId) {
  if (!lessonId || !OBJECT_ID.test(String(lessonId))) return null;
  const found = await lessons.get({ _id: String(lessonId) });
  if (!found || found.success === false) throw new Error("lesson lookup failed");
  return (found.result || [])[0] || null;
}

module.exports = { mayRecordAttendance, isInChargeOf, revokedRecord, readLesson };
