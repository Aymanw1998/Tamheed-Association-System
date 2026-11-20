// Rosters and a student who is becoming staff (owner, 2026-11-19; spec
// docs/superpowers/specs/2026-11-19-student-to-staff-design.md, section C).
// Before a lesson write: a student with a staffConversion, or archived, is not
// added (rosterable). After it: an add that raced the conversion's barrier is
// taken back (takeBackConverting), so the conversion's plan stays complete.
const rosterable = (student) => Boolean(student) && !student.staffConversion && !student.archivedAt;

const CONVERSION_IN_PROGRESS = {
  ok: false,
  code: "CONVERSION_IN_PROGRESS",
  message: "هذا الطالب يُحوَّل إلى الطاقم، لذلك لم يُضف إلى البرنامج",
};

// After a write that added `addedIds` to lesson `lessonId`: removes again the
// ones whose student now has a staffConversion (versioned write); returns the
// ids taken back. Tried a few times; if it still cannot finish, it throws, so the caller
// answers with an error instead of a quiet success (Codex build review).
async function takeBackConverting({ lessons, students, lessonId, addedIds, sameVersion, nextStamp, log = () => {} }) {
  const ids = [...new Set((Array.isArray(addedIds) ? addedIds : []).map(String))];
  if (!ids.length) return [];
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const back = [];
      for (const id of ids) {
        const found = await students.get({ _id: id });
        if (found?.success === false) throw new Error("student lookup failed");
        const student = (found?.result || [])[0];
        if (student && !rosterable(student)) back.push(id);
      }
      if (!back.length) return [];
      const lesson = ((await lessons.get({ _id: String(lessonId) }))?.result || [])[0];
      if (!lesson) return back;
      const list = (lesson.list_students || []).filter((x) => !back.includes(String(x)));
      if (list.length === (lesson.list_students || []).length) return back;
      const written = await lessons.updateExisting(sameVersion({ _id: String(lessonId) }, lesson), { list_students: list, updatedAt: nextStamp(lesson) });
      if (written?.result) return back;
    } catch (error) {
      lastError = error;
    }
  }
  log("rosterGuard.takeBack", lastError || new Error("program kept changing"));
  throw new Error("could not take back a student who is becoming staff");
}

module.exports = { rosterable, takeBackConverting, CONVERSION_IN_PROGRESS };
