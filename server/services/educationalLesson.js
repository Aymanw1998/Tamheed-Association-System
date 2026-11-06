// A responsible guide's educational lesson holds all of that guide's students
// (owner, 2026-11-05): a student joins on approval or when added, and moves when the
// guide changes. A waiting request is not a student yet.
const KIND = "educational";
const PENDING = "ينتظر";

const rows = (res) => (Array.isArray(res?.result) ? res.result : []);
const same = (a, b) => String(a) === String(b);

function createEducationalLessons({ lessons, students, now = () => new Date(), lockPrograms = async () => async () => {}, changed = () => {} }) {
  const lessonOf = async (teacher) => (teacher ? rows(await lessons.get({ teacher: String(teacher), kind: KIND }))[0] || null : null);

  // Retry a roster delta against the latest snapshot. Never replace a roster
  // another write changed while this request was awaiting the database.
  async function change(lesson, delta) {
    for (let attempt = 0; attempt < 8 && lesson; attempt += 1) {
      const list = lesson.list_students || [];
      const next = delta(list);
      if (next.length === list.length && next.every((id, i) => same(id, list[i]))) return 0;
      const before = lesson.updatedAt;
      const updatedAt = new Date(Math.max(now().getTime(), (new Date(before || 0).getTime() || 0) + 1));
      const saved = await lessons.updateExisting(
        { _id: String(lesson._id), updatedAt: before ?? null }, { list_students: next, updatedAt },
      );
      if (saved?.result) { changed(String(lesson._id)); return next.length - list.length; }
      lesson = rows(await lessons.get({ _id: String(lesson._id) }))[0];
    }
    throw new Error("Educational program changed repeatedly; enrolment could not be saved");
  }

  async function holdForStudentChange(from, to, req) {
    const programs = await Promise.all([lessonOf(from), lessonOf(to)]);
    return lockPrograms(programs.filter(Boolean).map((lesson) => `lesson:${lesson._id}`), req);
  }

  // Puts every student of this guide on the lesson. Returns how many joined.
  async function enrolAll(teacher) {
    const lesson = await lessonOf(teacher);
    if (!lesson) return 0;
    const own = rows(await students.get({ main_teacher: String(teacher) })).filter((s) => s.status !== PENDING);
    return change(lesson, (list) => [...new Set([...list.map(String), ...own.map((s) => String(s._id))])]);
  }

  // After a student's guide changed, or a request was approved.
  async function moveStudent(studentId, fromTeacher, toTeacher) {
    if (fromTeacher && !same(fromTeacher, toTeacher ?? "")) {
      const old = await lessonOf(fromTeacher);
      if (old && (old.list_students || []).some((x) => same(x, studentId))) {
        await change(old, (list) => list.filter((x) => !same(x, studentId)));
      }
    }
    const next = await lessonOf(toTeacher);
    if (next && !(next.list_students || []).some((x) => same(x, studentId))) {
      await change(next, (list) => list.some((x) => same(x, studentId)) ? list : [...list, String(studentId)]);
    }
  }

  // Taken by another lesson of the same guide? A guide has one for now.
  async function takenBy(teacher, ignoreId = null) {
    const lesson = await lessonOf(teacher);
    return lesson && !same(lesson._id, ignoreId ?? "") ? lesson : null;
  }

  return { enrolAll, moveStudent, takenBy, holdForStudentChange };
}

const educationalLessons = () => createEducationalLessons({
  lessons: require("../Entities/Lesson/Lesson.model").LessonModelDef,
  students: require("../Entities/Student/Student.model").StudentModelDef,
  lockPrograms: require("../middleware/lockGuard").acquireItemLocks,
  changed: (id) => require("./liveHub").notifyChange("lesson", id),
});

module.exports = { createEducationalLessons, educationalLessons, KIND };
