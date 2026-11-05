// A student's class. Stored as one of these words in Students.layer.
const NO_GRADE = "لا يوجد صف";
const UNIVERSITY = "جامعي";
const LADDER = ["روضة", "اول", "ثاني", "ثالث", "رابع", "خامس", "سادس", "سابع", "ثامن", "تاسع", "عاشر", "احد عشر", "ثاني عشر"];
const GRADES = [...LADDER, UNIVERSITY, NO_GRADE];

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
  ["الحادي عشر", "احد عشر"], ["حادي عشر", "احد عشر"], ["الثاني عشر", "ثاني عشر"], ["اثنا عشر", "ثاني عشر"],
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

// After ثاني عشر there is no class; جامعي and لا يوجد صف stay as they are.
function nextGrade(grade) {
  const index = LADDER.indexOf(grade);
  if (index === -1) return grade;
  return index === LADDER.length - 1 ? NO_GRADE : LADDER[index + 1];
}

module.exports = { GRADES, LADDER, NO_GRADE, UNIVERSITY, canonicalGrade, nextGrade };
