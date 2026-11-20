import { canStored, getStoredUserId } from "./session";

// Mirrors server/utils/attendanceRecord (owner, 2026-11-19): attendance.record,
// or «المسؤول» of this program with attendance.view. A revoke the client cannot
// see is refused by the server's lock, which leaves the sheet read-only.
export function mayRecordAttendance(lesson, { can = canStored, me = getStoredUserId() } = {}) {
  if (can("attendance.record")) return true;
  return Boolean(me) && lesson?.teacher != null && String(lesson.teacher) === String(me) && can("attendance.view");
}
