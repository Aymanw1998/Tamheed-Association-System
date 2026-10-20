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

// Options for the responsible-guide select. A current value missing from the
// instructors list (an inactive guide or a legacy id) is kept as its own
// option, flagged inactive, so the select shows the stored value.
export function responsibleGuideOptions(instructors, current) {
  const options = (Array.isArray(instructors) ? instructors : []).map((u) => ({
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
