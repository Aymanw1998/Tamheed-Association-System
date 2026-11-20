// POST /api/attendance/bulk-save: attendance.record, or the program's
// «المسؤول» (utils/attendanceRecord). The program is read only when the key is
// missing; a failed read answers 503 (fail closed).
const { can } = require("../utils/permissions");
const { mayRecordAttendance, readLesson } = require("../utils/attendanceRecord");

const FORBIDDEN = { code: "FORBIDDEN", message: "لا توجد صلاحية" };
const LOOKUP_FAILED = { ok: false, code: "LESSON_LOOKUP_FAILED", message: "تعذر التحقق من البرنامج، حاول مرة أخرى" };
const lazyLessons = () => require("../Entities/Lesson/Lesson.model").LessonModelDef;

function requireAttendanceRecord(lessons = null) {
  return async (req, res, next) => {
    if (can(req.actor, "attendance.record")) return next();
    let lesson;
    try {
      lesson = await readLesson(lessons || lazyLessons(), req.body?.lessonId);
    } catch {
      return res.status(503).json(LOOKUP_FAILED);
    }
    if (lesson && mayRecordAttendance(req.actor, lesson)) return next();
    return res.status(403).json(FORBIDDEN);
  };
}

module.exports = { requireAttendanceRecord };
