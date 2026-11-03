// Helpers for the student list inside the lesson form.
import { startOf, endOf } from "./lessonSchedule";
import { isValidIsraeliId } from "./israeliId";

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

const count = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

// How many students the viewer sees in a lesson and how many others the
// server hid from them (hiddenCount). Only the number of others is shown.
export const rosterSummary = ({ visible, hiddenCount } = {}) => ({
  shown: count(visible),
  others: count(hiddenCount),
});

// A guide may add a student he cannot see only by the complete ID number.
export const isFullTz = (value) => {
  const text = String(value ?? "").trim();
  return /^\d{9}$/.test(text) && isValidIsraeliId(text);
};

// Body for POST /lesson/addToList/:id (and the lesson create call). Looked-up
// students go by full ID number only: the server drops their _id for guides.
export const buildAddPayload = ({ ids = [], looked = [] } = {}) => {
  const tzs = [];
  for (const student of looked) {
    const tz = String(student?.tz ?? "").trim();
    if (tz && !tzs.includes(tz)) tzs.push(tz);
  }
  const lookedIds = new Set((looked || []).map((s) => String(s?._id)));
  const list = [];
  for (const id of ids || []) {
    const key = String(id);
    if (!lookedIds.has(key) && !list.includes(key)) list.push(key);
  }
  return { list_students: list, list_tz: tzs };
};

const totalOf = (lesson) => {
  const total = Number(lesson?.num_in_list);
  return Number.isFinite(total) ? total : (lesson?.list_students || []).length;
};

// Students that really joined, comparing the lesson before and after.
export const countAdded = (before, after) => Math.max(0, totalOf(after) - totalOf(before));

// POST /lesson answers { ok, lesson: { result: {...} } } (the stored document
// sits inside a wrapper, unscoped). Returns the document itself.
export const unwrapCreated = (lesson) => (lesson && lesson.result ? lesson.result : lesson || null);
