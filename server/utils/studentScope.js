const { Types } = require("mongoose");
const { can } = require("./permissions");

// A 24-hex id may be stored as a string or as an ObjectId; match both.
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const idMatch = (id) => (OBJECT_ID.test(id) ? { $in: [id, new Types.ObjectId(id)] } : id);

// Identifiers: lessons store teacher/helper as user _id and list_students as
// student _id, so scope rules use actor.id and student _id throughout.
function createStudentScope({ lessonModel, studentModel }) {
  async function visibleStudentIds(actor) {
    if (can(actor, "students.viewAll")) return null;
    const ids = new Set();
    // No id: nothing can match, and a lookup on "undefined" must never run.
    if (actor?.id == null || String(actor.id).trim() === "") return ids;
    const me = idMatch(String(actor.id));

    const [asTeacher, asHelper, responsible] = await Promise.all([
      lessonModel.get({ teacher: me }),
      lessonModel.get({ helper: me }),
      studentModel.get({ main_teacher: me }),
    ]);
    for (const res of [asTeacher, asHelper]) {
      for (const lesson of res?.result || []) {
        for (const sid of lesson.list_students || []) ids.add(String(sid));
      }
    }
    for (const s of responsible?.result || []) ids.add(String(s._id));
    return ids;
  }
  return { visibleStudentIds };
}

// Result: submitted ids that are visible (in submitted order), followed by
// existing ids the actor cannot see (preserved untouched).
function mergeRoster(existing, submitted, visible) {
  if (!visible) return submitted;
  const kept = [];
  const seen = new Set();
  for (const id of Array.isArray(submitted) ? submitted : []) {
    const k = String(id);
    if (visible.has(k) && !seen.has(k)) { seen.add(k); kept.push(id); }
  }
  const hidden = (Array.isArray(existing) ? existing : []).filter((id) => !visible.has(String(id)));
  return [...kept, ...hidden];
}

// Used by the Lesson controller and the assistant tools. The lesson as the
// actor may see it: list_students cut to visible ids, plus
// hiddenCount. num_in_list stays the true total. Unchanged for viewAll.
function scopeLesson(lesson, visible) {
  if (!visible) return lesson;
  const all = Array.isArray(lesson.list_students) ? lesson.list_students : [];
  const shown = all.filter((id) => visible.has(String(id)));
  return { ...lesson, list_students: shown, hiddenCount: all.length - shown.length, num_in_list: all.length };
}

module.exports = { createStudentScope, mergeRoster, scopeLesson };
