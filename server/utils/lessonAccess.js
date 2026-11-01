// Which lessons a user sees (owner, 2026-11-01): lessons.viewAll (an admin)
// sees every lesson; anyone else only the lessons he teaches or assists in.
// The responsible guide also views, never edits, a lesson that holds one of
// his own students (main_teacher), so he sees everything about that student.
// Used by the lesson, student and attendance routes and the assistant tools.
const { Types } = require("mongoose");
const { can } = require("./permissions");

const seesAllLessons = (actor) => can(actor, "lessons.viewAll");

// Teacher and helper ids are compared as strings (stored as strings or ObjectIds).
const isOnLesson = (actor, lesson) => {
  const me = String(actor?.id ?? "");
  return Boolean(me) && Boolean(lesson) && [lesson.teacher, lesson.helper].some((v) => v != null && String(v) === me);
};

const mayOpenLesson = (actor, lesson) => seesAllLessons(actor) || isOnLesson(actor, lesson);

const ownLessons = (actor, lessons) => {
  const list = Array.isArray(lessons) ? lessons : [];
  return seesAllLessons(actor) ? list : list.filter((lesson) => isOnLesson(actor, lesson));
};

// Whether the actor is this student's responsible guide (main_teacher).
const isResponsible = (student, actor) => {
  const me = String(actor?.id ?? "").trim();
  return Boolean(me) && student?.main_teacher != null && String(student.main_teacher) === me;
};

// `responsible`: the _ids of the actor's own students (responsibleStudentIds).
const holdsResponsible = (lesson, responsible) =>
  Boolean(responsible) && (lesson?.list_students || []).some((sid) => responsible.has(String(sid)));

const mayViewLesson = (actor, lesson, responsible) =>
  mayOpenLesson(actor, lesson) || holdsResponsible(lesson, responsible);

// The _ids of the students whose responsible guide is the actor; null for a
// lessons.viewAll holder (no need to look), empty without an actor id.
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
async function responsibleStudentIds(studentModel, actor) {
  if (seesAllLessons(actor)) return null;
  const me = String(actor?.id ?? "").trim();
  if (!me) return new Set();
  const found = await studentModel.get({ main_teacher: OBJECT_ID.test(me) ? { $in: [me, new Types.ObjectId(me)] } : me });
  return new Set((found?.result || []).map((s) => String(s._id)));
}

module.exports = { seesAllLessons, isOnLesson, mayOpenLesson, ownLessons, isResponsible, mayViewLesson, responsibleStudentIds };
