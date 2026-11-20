import { resolveRole } from "./roles";
// Fields the student form refuses to submit empty. Parent details, phone,
// email and notes are optional; the server itself only needs tz and names.
const REQUIRED_STUDENT_FIELDS = new Set([
  "tz",
  "firstname",
  "lastname",
  "birth_date",
  "gender",
  "city",
  "street",
]);

export const isRequiredStudentField = (name) => REQUIRED_STUDENT_FIELDS.has(name);

// Options for the responsible-guide select: guides and managers (owner,
// 2026-11-19). A current value that is not one of them stays as its own
// option so the select shows the stored value: an assistant chosen before
// that rule keeps his name; an inactive guide or a legacy id is flagged inactive.
const INSTRUCTOR_ROLES = new Set(["مرشد", "ادارة"]);
export function responsibleGuideOptions(instructors, current) {
  // A waiting or inactive user is not offered: the student page shows only an
  // active guide. A user without a room comes from an older list and stays.
  const active = (Array.isArray(instructors) ? instructors : []).filter((u) => !u.room || u.room === "active");
  const value0 = current == null ? "" : String(current);
  const offered = active.filter((u) => INSTRUCTOR_ROLES.has(resolveRole(u)) || String(u._id) === value0);
  const options = offered.map((u) => ({
    value: String(u._id),
    label: `${u.firstname || ""} ${u.lastname || ""}`.trim(),
    inactive: false,
  }));
  const value = current == null ? "" : String(current);
  if (value && !options.some((o) => o.value === value)) {
    options.unshift({ value, label: "", inactive: true });
  }
  return options;
}
