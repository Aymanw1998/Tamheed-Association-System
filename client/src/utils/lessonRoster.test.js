import {
  buildAddPayload,
  countAdded,
  filterRosterStudents,
  isFullTz,
  rosterConflicts,
  rosterSummary,
  searchStudentsToAdd,
  unwrapCreated,
} from "./lessonRoster";

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

describe("hidden-student summary", () => {
  test("rosterSummary separates the students shown from the hidden ones", () => {
    expect(rosterSummary({ visible: 3, hiddenCount: 2 })).toEqual({ shown: 3, others: 2 });
  });

  test("rosterSummary tolerates missing or bad numbers", () => {
    expect(rosterSummary({})).toEqual({ shown: 0, others: 0 });
    expect(rosterSummary({ visible: 2, hiddenCount: -4 })).toEqual({ shown: 2, others: 0 });
    expect(rosterSummary({ visible: "x", hiddenCount: "5" })).toEqual({ shown: 0, others: 5 });
    expect(rosterSummary()).toEqual({ shown: 0, others: 0 });
  });
});

describe("isFullTz", () => {
  test("only a complete valid ID number counts", () => {
    expect(isFullTz("12345678")).toBe(false);
    expect(isFullTz("123456782")).toBe(true);
    expect(isFullTz(" 123456782 ")).toBe(true);
    expect(isFullTz("123456789")).toBe(false);
    expect(isFullTz("12345678a")).toBe(false);
    expect(isFullTz("")).toBe(false);
    expect(isFullTz(null)).toBe(false);
  });
});

describe("buildAddPayload", () => {
  test("visible students go by _id and looked-up ones by full ID number", () => {
    expect(
      buildAddPayload({
        ids: ["a", "b", "a"],
        looked: [{ _id: "z", tz: "123456782" }, { _id: "y", tz: " 123456782 " }],
      })
    ).toEqual({ list_students: ["a", "b"], list_tz: ["123456782"] });
  });

  test("a looked-up student is never sent by _id", () => {
    expect(buildAddPayload({ ids: ["z"], looked: [{ _id: "z", tz: "123456782" }] })).toEqual({
      list_students: [],
      list_tz: ["123456782"],
    });
  });

  test("empty input gives empty lists", () => {
    expect(buildAddPayload()).toEqual({ list_students: [], list_tz: [] });
  });
});

describe("countAdded", () => {
  test("uses the true total when the lesson reports it", () => {
    expect(countAdded({ num_in_list: 4, list_students: ["a"] }, { num_in_list: 6, list_students: ["a"] })).toBe(2);
  });

  test("falls back to the visible list length", () => {
    expect(countAdded({ list_students: ["a"] }, { list_students: ["a", "b"] })).toBe(1);
    expect(countAdded(null, null)).toBe(0);
  });
});

describe("unwrapCreated", () => {
  test("reads the lesson out of the create response wrapper", () => {
    const created = { result: { _id: "L1", name: "x", list_students: ["a"] }, name: "", list_students: [], date: {} };
    expect(unwrapCreated(created)).toEqual({ _id: "L1", name: "x", list_students: ["a"] });
  });

  test("passes a plain lesson through and tolerates nothing", () => {
    expect(unwrapCreated({ _id: "L2" })).toEqual({ _id: "L2" });
    expect(unwrapCreated(null)).toBeNull();
  });
});
