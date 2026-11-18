// A student's class. Stored as one of these words in Students.layer.
const NO_GRADE = "لا يوجد صف";
const UNIVERSITY = "جامعي";
// After ثاني عشر (owner, 2026-11-16): «خريج», with graduationYear on the student.
const GRADUATE = "خريج";
const LADDER = ["روضة", "اول", "ثاني", "ثالث", "رابع", "خامس", "سادس", "سابع", "ثامن", "تاسع", "عاشر", "احد عشر", "ثاني عشر"];
const GRADES = [...LADDER, GRADUATE, UNIVERSITY, NO_GRADE];

const clean = (text) => String(text ?? "")
  .replace(/[أإآ]/g, "ا")
  .replace(/ى/g, "ي")
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  .replace(/\s+/g, " ")
  .trim();

const SPELLINGS = new Map([
  ["بستان", "روضة"], ["الروضة", "روضة"], ["روضه", "روضة"],
  ["الاول", "اول"], ["الثاني", "ثاني"], ["الثالث", "ثالث"], ["الرابع", "رابع"], ["الخامس", "خامس"],
  ["السادس", "سادس"], ["السابع", "سابع"], ["الثامن", "ثامن"], ["التاسع", "تاسع"], ["العاشر", "عاشر"],
  ["خريجة", "خريج"], ["الحادي عشر", "احد عشر"], ["حادي عشر", "احد عشر"], ["الثاني عشر", "ثاني عشر"], ["اثنا عشر", "ثاني عشر"],
]);

// The class word for what was typed before the list existed ("الصف الثالث", "3");
// "" when it cannot be read with certainty.
function canonicalGrade(text) {
  const value = clean(text).replace(/^الصف\s+/, "").replace(/^صف\s+/, "");
  if (!value) return "";
  if (GRADES.includes(value)) return value;
  if (clean(NO_GRADE) === value) return NO_GRADE;
  if (/^\d{1,2}$/.test(value)) {
    const number = Number(value);
    return number >= 1 && number <= 12 ? LADDER[number] : "";
  }
  return SPELLINGS.get(value) || "";
}

// After ثاني عشر comes خريج; خريج, جامعي and لا يوجد صف stay as they are.
function nextGrade(grade) {
  const index = LADDER.indexOf(grade);
  if (index === -1) return grade;
  return index === LADDER.length - 1 ? GRADUATE : LADDER[index + 1];
}

// The school year ends in the summer, so a student finishes in this
// calendar year (Israel time).
const israelYear = (now) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric" }).format(now));

// What a save adds for the graduation year: a student who becomes خريج now
// gets this year; one who stops being خريج loses it. {} when nothing changes.
function graduationPatch(layer, before = {}, now = new Date()) {
  if (layer === undefined) return {};
  if (layer === GRADUATE) return before.layer === GRADUATE && before.graduationYear ? {} : { graduationYear: israelYear(now) };
  return before.graduationYear ? { graduationYear: null } : {};
}

module.exports = { GRADES, LADDER, NO_GRADE, UNIVERSITY, GRADUATE, canonicalGrade, nextGrade, graduationPatch };
