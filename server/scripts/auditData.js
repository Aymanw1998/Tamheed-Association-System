const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", "config", ".env") });

const { UserModelDef } = require("../Entities/User/User.model");
const { StudentModelDef } = require("../Entities/Student/Student.model");
const { LessonModelDef } = require("../Entities/Lesson/Lesson.model");
const { ReportModelDef } = require("../Entities/Report/Report.model");
const { AttendanceModelDef } = require("../Entities/Attendance/Attendance.model");
const { InviteTokenModelDef } = require("../Entities/InviteToken/InviteToken.model");

const asSet = (list, key = "_id") => new Set((list || []).map((item) => String(item?.[key] ?? "")));

const countMissing = (values, targetSet) =>
  (values || []).filter((value) => value != null && !targetSet.has(String(value))).length;

const main = async () => {
  const [activeUsersRes, waitingUsersRes, inactiveUsersRes, studentsRes, lessonsRes, reportsRes, attendancesRes, inviteRes] =
    await Promise.all([
      UserModelDef.get({}, "active"),
      UserModelDef.get({}, "waiting"),
      UserModelDef.get({}, "noActive"),
      StudentModelDef.get({}),
      LessonModelDef.get({}),
      ReportModelDef.get({}),
      AttendanceModelDef.get({}),
      InviteTokenModelDef.get({}),
    ]);

  const activeUsers = activeUsersRes?.result || [];
  const waitingUsers = waitingUsersRes?.result || [];
  const inactiveUsers = inactiveUsersRes?.result || [];
  const students = studentsRes?.result || [];
  const lessons = lessonsRes?.result || [];
  const reports = reportsRes?.result || [];
  const attendances = attendancesRes?.result || [];
  const inviteTokens = inviteRes?.result || [];

  const activeUserIds = asSet(activeUsers);
  const studentIds = asSet(students);
  const lessonIds = asSet(lessons);

  const stats = {
    activeUsers: activeUsers.length,
    waitingUsers: waitingUsers.length,
    inactiveUsers: inactiveUsers.length,
    students: students.length,
    lessons: lessons.length,
    reports: reports.length,
    attendances: attendances.length,
    inviteTokens: inviteTokens.length,
  };

  const issues = {
    studentsMissingTeacher: students.filter((student) => student.main_teacher && !activeUserIds.has(String(student.main_teacher))).length,
    lessonsMissingTeacher: lessons.filter((lesson) => lesson.teacher && !activeUserIds.has(String(lesson.teacher))).length,
    lessonsMissingHelper: lessons.filter((lesson) => lesson.helper && !activeUserIds.has(String(lesson.helper))).length,
    lessonsMissingStudents: lessons.reduce(
      (sum, lesson) => sum + countMissing(lesson.list_students, studentIds),
      0
    ),
    reportsMissingAuthor: reports.filter((report) => report.createdBy && !activeUserIds.has(String(report.createdBy))).length,
    reportsMissingAttendanceUsers: reports.reduce(
      (sum, report) => sum + countMissing(report.attendance, activeUserIds),
      0
    ),
    attendanceMissingLesson: attendances.filter((row) => row.lesson && !lessonIds.has(String(row.lesson))).length,
    attendanceMissingStudent: attendances.filter((row) => row.student && !studentIds.has(String(row.student))).length,
    duplicateUserTz: activeUsers.length - new Set(activeUsers.map((user) => user.tz)).size,
    duplicateStudentTz: students.length - new Set(students.map((student) => student.tz)).size,
    expiredInviteTokens: inviteTokens.filter((token) => token.expiresAt && new Date(token.expiresAt) < new Date()).length,
  };

  console.log("DATA COUNTS");
  console.table(stats);

  console.log("RELATIONSHIP / INTEGRITY ISSUES");
  console.table(issues);

  const hasIssues = Object.values(issues).some((value) => Number(value) > 0);
  if (hasIssues) {
    console.log("Audit finished with issues. Review the table above.");
    process.exit(1);
  }

  console.log("Audit finished cleanly.");
  process.exit(0);
};

main().catch((error) => {
  console.error("Audit failed:", error);
  process.exit(1);
});
