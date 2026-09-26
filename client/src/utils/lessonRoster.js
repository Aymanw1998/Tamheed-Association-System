// Helpers for the student list inside the lesson form.
import { startOf, endOf } from "./lessonSchedule";

const fullName = (student) => `${student?.firstname || ""} ${student?.lastname || ""}`.trim();

// Registered ("عادي") students have status "عادي" or no status yet.
const isRegistered = (student) => {
  const status = String(student?.status || "").trim();
  return !status || status === "عادي";
};

const matchesQuery = (student, query) => {
  const q = String(query || "").trim().toLowerCase();
  return !q || `${fullName(student)} ${student?.tz || ""}`.toLowerCase().includes(q);
};

// Students that can still be added: registered, not already in the lesson,
// matching the query by name or ID number, sorted by full name.
export const searchStudentsToAdd = (students, query, selectedIds) => {
  const selected = new Set((selectedIds || []).map(String));
  return (students || [])
    .filter((student) => isRegistered(student) && !selected.has(String(student._id)))
    .filter((student) => matchesQuery(student, query))
    .sort((a, b) => fullName(a).localeCompare(fullName(b), "ar", { sensitivity: "base" }));
};

// The lesson's own students that match the query, in their current order.
export const filterRosterStudents = (enrolled, query) =>
  (enrolled || []).filter((student) => matchesQuery(student, query));

// For each student in `lesson`, the names of other lessons on the same day
// whose time overlaps and that already include that student.
export const rosterConflicts = (lesson, allLessons) => {
  const day = Number(lesson?.date?.day);
  const start = startOf(lesson);
  const end = endOf(lesson);
  const conflicts = {};

  for (const other of allLessons || []) {
    if (!other?.date || (lesson?._id && String(other._id) === String(lesson._id))) continue;
    if (Number(other.date.day) !== day) continue;
    if (!(start < endOf(other) && startOf(other) < end)) continue;

    const others = new Set((other.list_students || []).map(String));
    for (const id of lesson?.list_students || []) {
      if (others.has(String(id))) {
        (conflicts[id] = conflicts[id] || []).push(other.name);
      }
    }
  }
  return conflicts;
};
