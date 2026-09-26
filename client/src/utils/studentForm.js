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
