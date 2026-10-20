import { isRequiredStudentField, responsibleGuideOptions } from "./studentForm";

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


const users = [
  { _id: "u1", firstname: "A", lastname: "One" },
  { _id: "u2", firstname: "B", lastname: "Two" },
];

test("the guide options list every instructor by name", () => {
  expect(responsibleGuideOptions(users, "u2")).toEqual([
    { value: "u1", label: "A One", inactive: false },
    { value: "u2", label: "B Two", inactive: false },
  ]);
});

test("a current guide missing from the list is added as an inactive option", () => {
  expect(responsibleGuideOptions(users, "gone")).toEqual([
    { value: "gone", label: "", inactive: true },
    { value: "u1", label: "A One", inactive: false },
    { value: "u2", label: "B Two", inactive: false },
  ]);
});

test.each([null, undefined, ""])("no extra option when there is no current guide (%p)", (current) => {
  expect(responsibleGuideOptions(users, current)).toHaveLength(2);
});

test("a missing instructors list is treated as empty", () => {
  expect(responsibleGuideOptions(undefined, "gone")).toEqual([{ value: "gone", label: "", inactive: true }]);
});
