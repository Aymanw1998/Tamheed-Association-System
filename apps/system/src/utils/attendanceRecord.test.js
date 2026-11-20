import { mayRecordAttendance } from "./attendanceRecord";

const keys = (...list) => (key) => list.includes(key);

test("a key holder records any program", () => {
  expect(mayRecordAttendance({ teacher: "x" }, { can: keys("attendance.record"), me: "me" })).toBe(true);
});

test("an assistant records only the program he is in charge of", () => {
  const can = keys("attendance.view");
  expect(mayRecordAttendance({ teacher: "me" }, { can, me: "me" })).toBe(true);
  expect(mayRecordAttendance({ teacher: "x", helper: "me" }, { can, me: "me" })).toBe(false);
  expect(mayRecordAttendance({ teacher: "me" }, { can: keys(), me: "me" })).toBe(false);
});
