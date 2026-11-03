// Links between students, guides and lessons, picked out of the lists the
// client already loads (GET /lesson, GET /students). Ids are compared as
// strings: the server may hold a string or an ObjectId.
import { DAY_NAMES, startOf, toHHMM } from "./lessonSchedule";

const same = (a, b) => a != null && b != null && String(a) === String(b);

// By day, then start time (startOf reads startMin, or the older date.hh).
export const byLessonTime = (a, b) =>
  (Number(a?.date?.day) || 0) - (Number(b?.date?.day) || 0) || startOf(a) - startOf(b);
const byTime = byLessonTime;

const fullName = (p) => `${p?.firstname || ""} ${p?.lastname || ""}`.trim();

// The lessons the user teaches or helps in, by day and start time.
export const guideLessons = (lessons, userId) =>
  (Array.isArray(lessons) ? lessons : [])
    .filter((l) => same(l?.teacher, userId) || same(l?.helper, userId))
    .sort(byTime);

// The students the user is the responsible guide of, by name.
export const guideStudents = (students, userId) =>
  (Array.isArray(students) ? students : [])
    .filter((s) => same(s?.main_teacher, userId))
    .sort((a, b) => fullName(a).localeCompare(fullName(b), "ar"));

// "<day name> HH:MM" (day 1..7).
export const lessonWhen = (lesson) => {
  const day = DAY_NAMES[(Number(lesson?.date?.day) || 1) - 1] || "";
  return `${day} ${toHHMM(startOf(lesson))}`.trim();
};

// Where a guide's name leads: the viewer's own profile, the guide's page when
// the server sent the guide's tz (users.view holders only), or nowhere.
export const guideLink = (contact, viewerId, guideId) => {
  if (!contact) return null;
  if (same(viewerId, guideId)) return "/profile";
  return contact.tz ? `/users/${contact.tz}` : null;
};
