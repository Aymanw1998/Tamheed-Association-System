// A responsible user can have multiple educational programs. Legacy programs
// automatically include all their students; selected programs keep manual
// rosters. Changing the responsible user removes the student from old programs
// and adds them only to the new user's automatic programs.
const KIND = "educational";
const PENDING = "ينتظر";

const rows = (res) => (Array.isArray(res?.result) ? res.result : []);
const same = (a, b) => String(a) === String(b);
const automatic = (lesson) => lesson.kind === KIND && lesson.educationalRoster !== "selected";
// A student becoming staff, or archived, is never enrolled (owner, 2026-11-19).
const { rosterable } = require("../utils/rosterGuard");

function createEducationalLessons({ lessons, students, now = () => new Date(), lockPrograms = async () => async () => {}, changed = () => {} }) {
  const lessonsOf = async (teacher) => teacher ? rows(await lessons.get({ teacher: String(teacher), kind: KIND })) : [];

  // Retry a roster delta against the latest snapshot. Never replace a roster
  // another write changed while this request was awaiting the database.
  async function change(lesson, delta, onWritten = () => {}) {
    for (let attempt = 0; attempt < 8 && lesson; attempt += 1) {
      const list = lesson.list_students || [];
      const next = delta(list, lesson);
      if (next.length === list.length && next.every((id, i) => same(id, list[i]))) return 0;
      const before = lesson.updatedAt;
      const updatedAt = new Date(Math.max(now().getTime(), (new Date(before || 0).getTime() || 0) + 1));
      const saved = await lessons.updateExisting(
        { _id: String(lesson._id), updatedAt: before ?? null }, { list_students: next, updatedAt },
      );
      if (saved?.result) { changed(String(lesson._id)); onWritten(list, next); return next.length - list.length; }
      lesson = rows(await lessons.get({ _id: String(lesson._id) }))[0];
    }
    throw new Error("Educational program changed repeatedly; enrolment could not be saved");
  }

  async function holdForStudentChange(from, to, req) {
    const programs = (await Promise.all([lessonsOf(from), lessonsOf(to)])).flat();
    return lockPrograms([...new Set(programs.map((lesson) => `lesson:${lesson._id}`))].sort(), req);
  }

  // After a write: a student who started becoming staff meanwhile is taken off
  // again, so the conversion's plan stays complete (Codex build review).
  async function takeBackConverting(lessonId, addedIds) {
    const back = [];
    for (const id of addedIds) {
      const found = await students.get({ _id: String(id) });
      if (!found || found.success === false) throw new Error("student lookup failed");
      const student = rows(found)[0];
      if (student && !rosterable(student)) back.push(String(id));
    }
    if (!back.length) return;
    const lesson = rows(await lessons.get({ _id: String(lessonId) }))[0];
    if (!lesson) return;
    await change(lesson, (list) => list.filter((x) => !back.includes(String(x))));
  }

  // Puts every student of this guide on the lesson. Returns how many joined.
  async function enrolAll(teacher, lessonId = null) {
    const programs = (await lessonsOf(teacher)).filter((lesson) => automatic(lesson) && (!lessonId || same(lesson._id, lessonId)));
    if (!programs.length) return 0;
    const own = rows(await students.get({ main_teacher: String(teacher) })).filter((s) => s.status !== PENDING && rosterable(s));
    let added = 0;
    for (const lesson of programs) {
      // The ids this write put on the roster, against the roster it was
      // written over (a retry included): only those are checked again, so a
      // member who was already there is never taken off, and one a retry put
      // back after the conversion took him off is (Codex build reviews 2, 3).
      let putOn = [];
      added += await change(lesson, (list, current) => automatic(current) && same(current.teacher, teacher)
        ? [...new Set([...list.map(String), ...own.map((s) => String(s._id))])] : list,
      (list, next) => { const had = new Set(list.map(String)); putOn = next.map(String).filter((x) => !had.has(x)); });
      await takeBackConverting(lesson._id, putOn);
    }
    return added;
  }

  // After a student's guide changed, or a request was approved.
  async function moveStudent(studentId, fromTeacher, toTeacher) {
    if (fromTeacher && !same(fromTeacher, toTeacher ?? "")) {
      for (const old of await lessonsOf(fromTeacher)) {
        await change(old, (list, current) => current.kind === KIND && same(current.teacher, fromTeacher) ? list.filter((x) => !same(x, studentId)) : list);
      }
    }
    const student = rows(await students.get({ _id: String(studentId) }))[0];
    if (student && !rosterable(student)) return;
    for (const next of (await lessonsOf(toTeacher)).filter(automatic)) {
      // Taken back only when this write put him on: a membership he already
      // had is left for the conversion's scan (Codex build review 5).
      let putOn = false;
      await change(next, (list, current) => !automatic(current) || !same(current.teacher, toTeacher) || list.some((x) => same(x, studentId)) ? list : [...list, String(studentId)],
        () => { putOn = true; });
      if (putOn) await takeBackConverting(next._id, [String(studentId)]);
    }
  }
  return { enrolAll, moveStudent, holdForStudentChange };
}

const educationalLessons = () => createEducationalLessons({
  lessons: require("../Entities/Lesson/Lesson.model").LessonModelDef,
  students: require("../Entities/Student/Student.model").StudentModelDef,
  lockPrograms: require("../middleware/lockGuard").acquireItemLocks,
  changed: (id) => require("./liveHub").notifyChange("lesson", id),
});

module.exports = { createEducationalLessons, educationalLessons, KIND };
