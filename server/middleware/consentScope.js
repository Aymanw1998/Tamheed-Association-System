// Signature access follows the same student scope as the student's own page.
// Public parent links use their separate, expiring capability checks.
function createConsentScope({ visibleStudentIds = async (actor) => {
  const { createStudentScope } = require("../utils/studentScope");
  return createStudentScope({
    lessonModel: require("../Entities/Lesson/Lesson.model").LessonModelDef,
    studentModel: require("../Entities/Student/Student.model").StudentModelDef,
  }).visibleStudentIds(actor);
} } = {}) {
  return async (req, res, next) => {
    try {
      const ids = await visibleStudentIds(req.actor);
      if (ids !== null && !ids.has(String(req.params.studentId))) {
        return res.status(404).json({ ok: false, message: "الطالب غير موجود" });
      }
      return next();
    } catch (error) { return next(error); }
  };
}
module.exports = { createConsentScope, consentScope: createConsentScope() };
