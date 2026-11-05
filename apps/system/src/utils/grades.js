// The classes a student can be in (server/utils/grades.js keeps the same list).
export const GRADES = ["روضة", "اول", "ثاني", "ثالث", "رابع", "خامس", "سادس", "سابع", "ثامن", "تاسع", "عاشر", "احد عشر", "ثاني عشر", "جامعي", "لا يوجد صف"];

// A class typed before the list existed stays selectable, so opening and
// saving an old record does not lose it.
export const gradeOptions = (current) => (current && !GRADES.includes(current) ? [current, ...GRADES] : GRADES);
