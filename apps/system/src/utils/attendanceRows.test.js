import { rowKey, isStaffRow, toSaveItems, sheetCounts } from "./attendanceRows";

// The attendance sheet holds students and, after them, participating users
// (kind "user", owner 2026-11-09). Synthetic ids only.
const STUDENT = { studentId: "s1", studentName: "طالب", status: "حاضر", notes: "" };
const STAFF = { userId: "u1", studentName: "موظف", kind: "user", status: "غائب", notes: "إجازة" };

test("rows are keyed by student id, and users by u:<id>", () => {
  expect(rowKey(STUDENT)).toBe("s1");
  expect(rowKey(STAFF)).toBe("u:u1");
  expect(isStaffRow(STAFF)).toBe(true);
  expect(isStaffRow(STUDENT)).toBe(false);
});

test("a save sends studentId for students and userId for users", () => {
  expect(toSaveItems([STUDENT, STAFF])).toEqual([
    { studentId: "s1", status: "حاضر", notes: "" },
    { userId: "u1", status: "غائب", notes: "إجازة" },
  ]);
});

test("the counts keep students and staff apart", () => {
  const counts = sheetCounts([STUDENT, { ...STUDENT, studentId: "s2", status: "متأخر" }, STAFF]);
  expect(counts.students).toEqual({ "حاضر": 1, "متأخر": 1, "غائب": 0 });
  expect(counts.staff).toEqual({ "حاضر": 0, "متأخر": 0, "غائب": 1 });
  expect(counts.staffTotal).toBe(1);
});
