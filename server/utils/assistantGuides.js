// Students whose «المرشد المسؤول» is an assistant (owner, 2026-11-19): from
// now on only a guide or a manager can be chosen, and the ones set before stay
// until a manager changes them. IT sees this list (read-only) to pass it on.
const { resolveRole } = require("./permissions");

async function studentsWithAssistantGuide({ students, users }) {
  const staff = await users.get({}, "active");
  if (!staff || staff.success === false) throw new Error("users lookup failed");
  const assistants = new Map((staff.result || [])
    .filter((u) => resolveRole(u) === "مساعد")
    .map((u) => [String(u._id), `${u.firstname || ""} ${u.lastname || ""}`.trim()]));
  if (!assistants.size) return [];
  const all = await students.get({});
  if (!all || all.success === false) throw new Error("students lookup failed");
  return (all.result || [])
    .filter((s) => s.main_teacher != null && assistants.has(String(s.main_teacher)) && !s.archivedAt)
    .map((s) => ({
      studentId: String(s._id),
      student: `${s.firstname || ""} ${s.lastname || ""}`.trim(),
      assistant: assistants.get(String(s.main_teacher)),
    }))
    .sort((a, b) => a.assistant.localeCompare(b.assistant, "ar") || a.student.localeCompare(b.student, "ar"));
}

module.exports = { studentsWithAssistantGuide };
