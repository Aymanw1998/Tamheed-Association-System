import { requiredUserFields } from "./userFormFields";

test("adding a user asks only for what is needed to start", () => {
  expect(requiredUserFields({ isNew: true })).toEqual(["tz", "firstname", "lastname", "phone"]);
});

test("editing asks for the same: a user added with the short form can be edited", () => {
  expect(requiredUserFields({ isNew: false })).toEqual(["tz", "firstname", "lastname", "phone"]);
});
