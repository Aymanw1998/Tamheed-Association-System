// The classes a student can be in (server/utils/grades.js keeps the same list).
export const GRADES = ["روضة", "اول", "ثاني", "ثالث", "رابع", "خامس", "سادس", "سابع", "ثامن", "تاسع", "عاشر", "احد عشر", "ثاني عشر", "خريج", "جامعي", "لا يوجد صف"];
export const GRADUATE = "خريج";

// «خريج · 2027» (owner, 2026-11-16): a graduate shows the year finished.
export const gradeLabel = (student) => {
  const layer = String(student?.layer || "");
  return layer === GRADUATE && student?.graduationYear ? `${layer} · ${student.graduationYear}` : layer;
};

// A class typed before the list existed stays selectable, so opening and
// saving an old record does not lose it.
export const gradeOptions = (current) => (current && !GRADES.includes(current) ? [current, ...GRADES] : GRADES);
