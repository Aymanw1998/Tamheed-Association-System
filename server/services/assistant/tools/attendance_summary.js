const { ABSENT_STATUS, isAutoAbsence } = require("../../../utils/attendanceMarks");
const {
  FORBIDDEN, NOT_FOUND, invalid, OBJECT_ID, jerusalemDate, addDays, daysBetween, dateKeyOf, dateOfKey,
  fullName, rows, bucketOf,
} = require("./_shared");

const DEFAULT_DAYS = 7;
const MAX_DAYS = 92;
const MAX_STUDENTS = 50;

const counts = () => ({ present: 0, absent: 0, late: 0, other: 0 });

// The current run of absences at the end of the period (newest first).
// Absences the nightly job created (nobody recorded them) neither count nor
// break a run, as in the alert job.
function absenceStreak(studentRows) {
  let streak = 0;
  for (const r of [...studentRows].sort((a, b) => Number(b.dateKey) - Number(a.dateKey))) {
    if (isAutoAbsence(r)) continue;
    if (r.status !== ABSENT_STATUS) break;
    streak += 1;
  }
  return streak;
}

// Attendance counts per student and per lesson over a period, for students
// in the user's scope only (attendance.view, like GET /api/attendance/sheet).
module.exports = {
  name: "attendance_summary",
  description: "Attendance over a period (default: the last 7 days, at most 92 days) for the students the user may see: "
    + "per student present/absent/late counts, automatic absences (no attendance was taken), the current absence streak "
    + "and last absence date; and per lesson counts. Optional filters: one student id or one lesson id. "
    + "Students are sorted by most absences; at most 50 are listed.",
  input_schema: {
    type: "object",
    properties: {
      from: { type: "string", format: "date", description: "Start, YYYY-MM-DD." },
      to: { type: "string", format: "date", description: "End, YYYY-MM-DD (default today)." },
      studentId: { type: "string", pattern: OBJECT_ID, description: "Only this student (id from search_students)." },
      lessonId: { type: "string", pattern: OBJECT_ID, description: "Only this lesson (id from list_lessons)." },
    },
    required: [],
    additionalProperties: false,
  },
  async run(raw, ctx) {
    if (!ctx.can("attendance.view")) return FORBIDDEN;
    // Stored ids are lower-case hex.
    const input = { ...raw, studentId: raw.studentId?.toLowerCase(), lessonId: raw.lessonId?.toLowerCase() };
    const today = jerusalemDate(ctx.now);
    const to = input.to || today;
    const from = input.from || addDays(to, -(DEFAULT_DAYS - 1));
    const span = daysBetween(from, to);
    if (span < 0) return invalid("from must not be after to");
    if (span >= MAX_DAYS) return invalid(`at most ${MAX_DAYS} days`);

    const visible = await ctx.visible();
    if (input.studentId && visible && !visible.has(input.studentId)) return NOT_FOUND;

    const filter = { dateKey: { $gte: dateKeyOf(from), $lte: dateKeyOf(to) } };
    if (input.studentId) filter.student = input.studentId;
    if (input.lessonId) filter.lesson = input.lessonId;
    const [attendance, students, lessons] = await Promise.all([
      ctx.models.Attendance.get(filter),
      ctx.models.Student.get({}),
      ctx.models.Lesson.get({}),
    ]);
    const studentById = new Map(rows(students).filter((s) => !ctx.isSystemTz(s.tz)).map((s) => [String(s._id), s]));
    const lessonName = new Map(rows(lessons).map((l) => [String(l._id), l.name || ""]));

    const perStudent = new Map();
    const perLesson = new Map();
    const totals = counts();
    for (const r of rows(attendance)) {
      const sid = String(r.student);
      if (visible && !visible.has(sid)) continue;
      if (!studentById.has(sid)) continue;
      const bucket = bucketOf(r.status);
      totals[bucket] += 1;
      if (!perStudent.has(sid)) perStudent.set(sid, { rows: [], ...counts(), autoAbsent: 0, lastAbsence: null });
      const s = perStudent.get(sid);
      s.rows.push(r);
      s[bucket] += 1;
      if (isAutoAbsence(r)) s.autoAbsent += 1;
      if (bucket === "absent") {
        const d = dateOfKey(r.dateKey);
        if (!s.lastAbsence || d > s.lastAbsence) s.lastAbsence = d;
      }
      const lid = String(r.lesson ?? "");
      if (!perLesson.has(lid)) perLesson.set(lid, counts());
      perLesson.get(lid)[bucket] += 1;
    }

    const list = [...perStudent.entries()]
      .map(([sid, s]) => ({
        id: sid,
        name: fullName(studentById.get(sid)),
        present: s.present, absent: s.absent, late: s.late, other: s.other,
        autoAbsent: s.autoAbsent,
        absenceStreak: absenceStreak(s.rows),
        lastAbsence: s.lastAbsence,
      }))
      .sort((a, b) => b.absent - a.absent || String(a.name).localeCompare(String(b.name)));

    return {
      from, to,
      totals,
      studentCount: list.length,
      students: list.slice(0, MAX_STUDENTS),
      lessons: [...perLesson.entries()].map(([id, c]) => ({ id, name: lessonName.get(id) || "", ...c })),
    };
  },
};
