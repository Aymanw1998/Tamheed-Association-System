import { isRequiredStudentField } from "./studentForm";

test.each(["father_name", "father_phone", "father_work", "mother_name", "mother_phone", "mother_work"])(
  "the parent field %s is optional",
  (name) => {
    expect(isRequiredStudentField(name)).toBe(false);
  }
);

test.each(["tz", "firstname", "lastname", "birth_date", "gender", "city", "street"])(
  "the student field %s is required",
  (name) => {
    expect(isRequiredStudentField(name)).toBe(true);
  }
);

test.each(["phone", "email", "notes"])("the field %s is optional", (name) => {
  expect(isRequiredStudentField(name)).toBe(false);
});
