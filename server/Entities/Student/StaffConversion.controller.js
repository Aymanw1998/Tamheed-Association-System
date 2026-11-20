// POST /api/students/:id/make-staff (owner, 2026-11-19; spec
// docs/superpowers/specs/2026-11-19-student-to-staff-design.md, section C).
// The same call finishes a conversion that stopped half way («إكمال التحويل»).
const crypto = require("crypto");
const { Types } = require("mongoose");
const { logWithSource } = require("../../middleware/logger");
const { audit } = require("../../utils/audit");
const { createStudentScope } = require("../../utils/studentScope");
const { isOnLesson } = require("../../utils/lessonAccess");
const { sameVersion, nextStamp } = require("../../middleware/lockGuard");
const { notifyChange } = require("../../services/liveHub");
const { createStaffConversion } = require("../../services/staffConversion");
const { StudentModelDef } = require("./Student.model");
const { LessonModelDef } = require("../Lesson/Lesson.model");
const { UserModelDef } = require("../User/User.model");
const { AttendanceModelDef } = require("../Attendance/Attendance.model");

const users = () => require("../User/User.controller");
const scope = createStudentScope({ lessonModel: LessonModelDef, studentModel: StudentModelDef });

const conversion = createStaffConversion({
  students: StudentModelDef,
  lessons: LessonModelDef,
  users: UserModelDef,
  attendance: AttendanceModelDef,
  recordRequired: (req, entry) => audit.recordRequired(req, entry),
  createUser: (args) => users().createUserFromStudent(args),
  copyPhoto: (args) => users().copyStudentPhotoToUser(args),
  newId: () => String(new Types.ObjectId()),
  sameVersion,
  nextStamp,
  log: logWithSource,
});

const makeStaff = async (req, res) => {
  try {
    const actor = req.actor;
    const visible = await scope.visibleStudentIds(actor);
    // The student in the actor's scope; on a resume also through a planned
    // program he is on (the moves take the student off those rosters).
    const mayAccess = async (student, conv) => {
      if (!visible || visible.has(String(student._id))) return true;
      if (!Array.isArray(conv?.plannedLessons) || !conv.plannedLessons.length) return false;
      const all = (await LessonModelDef.get({}))?.result || [];
      return all.some((l) => conv.plannedLessons.some((id) => String(id) === String(l._id)) && isOnLesson(actor, l));
    };
    const { status, body } = await conversion.run({
      actor,
      req,
      studentId: String(req.params.id || ""),
      body: req.body || {},
      requestId: crypto.randomUUID(),
      mayAccess,
      mayGiveRole: (role) => users().mayGiveStaffRole(actor, role),
    });
    if (status === 200) {
      notifyChange("student", String(req.params.id));
      notifyChange("user", body.userId);
    }
    return res.status(status).json(body);
  } catch (err) {
    logWithSource("Student.makeStaff", err);
    return res.status(500).json({ ok: false, message: "server error" });
  }
};

module.exports = { makeStaff };
