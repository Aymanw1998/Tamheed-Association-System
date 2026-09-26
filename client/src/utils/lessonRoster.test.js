import { filterRosterStudents, rosterConflicts, searchStudentsToAdd } from "./lessonRoster";

const s = (id, firstname, lastname, tz, status = "عادي") => ({ _id: id, firstname, lastname, tz, status });

const STUDENTS = [
  s("a", "مريم", "حسونة", "992000018"),
  s("b", "آدم", "أبو صويص", "992000000"),
  s("c", "جنى", "عودة", "992000026", "ينتظر"),
  s("d", "عمر", "الشيخ", "992000034"),
];

test("students already in the lesson are not offered again", () => {
  expect(searchStudentsToAdd(STUDENTS, "", ["a"]).map((x) => x._id)).toEqual(["b", "d"]);
});

test("only registered students are offered", () => {
  expect(searchStudentsToAdd(STUDENTS, "", []).map((x) => x._id)).not.toContain("c");
});

test("the search matches first name, last name, or ID number", () => {
  expect(searchStudentsToAdd(STUDENTS, "صويص", []).map((x) => x._id)).toEqual(["b"]);
  expect(searchStudentsToAdd(STUDENTS, "992000034", []).map((x) => x._id)).toEqual(["d"]);
  expect(searchStudentsToAdd(STUDENTS, "مريم حسونة", []).map((x) => x._id)).toEqual(["a"]);
});

test("results are sorted by full name", () => {
  expect(searchStudentsToAdd(STUDENTS, "", []).map((x) => x._id)).toEqual(["b", "d", "a"]);
});

const lesson = (id, day, startMin, endMin, list, name = id) => ({
  _id: id,
  name,
  date: { day, startMin, endMin },
  list_students: list,
});

test("a student in another lesson at an overlapping time is a conflict", () => {
  const current = lesson("x", 1, 840, 885, ["a", "b"]);
  const others = [lesson("y", 1, 870, 915, ["a"], "رياضيات"), lesson("z", 1, 885, 930, ["b"], "علوم")];
  expect(rosterConflicts(current, [current, ...others])).toEqual({ a: ["رياضيات"] });
});

test("lessons on another day never conflict", () => {
  const current = lesson("x", 1, 840, 885, ["a"]);
  expect(rosterConflicts(current, [lesson("y", 2, 840, 885, ["a"])])).toEqual({});
});

test("the lesson itself is ignored when editing", () => {
  const current = lesson("x", 1, 840, 885, ["a"]);
  expect(rosterConflicts(current, [lesson("x", 1, 840, 885, ["a"])])).toEqual({});
});

test("a new lesson without an id still checks the others", () => {
  const current = lesson(undefined, 3, 600, 645, ["d"]);
  expect(rosterConflicts(current, [lesson("y", 3, 630, 700, ["d"], "رسم")])).toEqual({ d: ["رسم"] });
});

test("the enrolled list is filtered by name or ID number, keeping its order", () => {
  const enrolled = [STUDENTS[3], STUDENTS[0], STUDENTS[1]];
  expect(filterRosterStudents(enrolled, "").map((x) => x._id)).toEqual(["d", "a", "b"]);
  expect(filterRosterStudents(enrolled, "حسونة").map((x) => x._id)).toEqual(["a"]);
  expect(filterRosterStudents(enrolled, "9920000").map((x) => x._id)).toEqual(["d", "a", "b"]);
  expect(filterRosterStudents(enrolled, "عمر الشيخ").map((x) => x._id)).toEqual(["d"]);
});

test("with no query, every registered student not in the lesson is offered", () => {
  expect(searchStudentsToAdd(STUDENTS, "  ", ["d"]).map((x) => x._id)).toEqual(["b", "a"]);
});
