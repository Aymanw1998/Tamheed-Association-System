// Text for the compact student and user cards on phones.
const HEALTHY = new Set(["سليم", "سليمة", "-"]);

export const personInitial = (person) => {
  const name = String(person?.firstname || "").trim() || String(person?.lastname || "").trim();
  return name ? name[0] : "؟";
};

// Same year-difference age as the students and users tables.
const ageOf = (birthDate, now) => {
  if (!birthDate) return null;
  const date = new Date(birthDate);
  if (Number.isNaN(date.getTime())) return null;
  return now.getFullYear() - date.getFullYear();
};

export const joinParts = (parts) => parts.map((part) => String(part || "").trim()).filter(Boolean).join(" · ");

export const studentSummary = (student, now = new Date()) => {
  const age = ageOf(student?.birth_date, now);
  return joinParts([student?.layer, age === null ? "" : `العمر ${age}`, student?.father_name]);
};

export const userSummary = (user, now = new Date()) => {
  const age = ageOf(user?.birth_date, now);
  const roles = (Array.isArray(user?.roles) ? user.roles : []).filter(Boolean).join(" / ");
  return joinParts([roles, age === null ? "" : `العمر ${age}`, user?.city]);
};

export const healthNote = (student) => {
  const note = String(student?.health_status || "").trim();
  return HEALTHY.has(note) ? "" : note;
};
