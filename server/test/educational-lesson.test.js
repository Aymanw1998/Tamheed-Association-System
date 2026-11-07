const assert = require("node:assert/strict");
const test = require("node:test");
const { createEducationalLessons } = require("../services/educationalLesson");

function model(docs) {
  const matches = (doc, filter) => Object.keys(filter).every((key) => filter[key] == null ? doc[key] == null : String(doc[key]) === String(filter[key]));
  return {
    docs,
    async get(filter = {}) { return { result: docs.filter((doc) => matches(doc, filter)).map((doc) => structuredClone(doc)) }; },
    async updateExisting(filter, data) {
      const doc = docs.find((row) => matches(row, filter));
      if (!doc) return { result: null };
      Object.assign(doc, data);
      return { result: doc };
    },
  };
}

function setup() {
  const lessons = model([
    { _id: "e1", teacher: "g1", kind: "educational", list_students: ["s9"] },
    { _id: "e2", teacher: "g2", kind: "educational", list_students: ["s3"] },
    { _id: "r1", teacher: "g1", kind: "regular", list_students: [] },
  ]);
  const students = model([
    { _id: "s1", main_teacher: "g1", status: "عادي" },
    { _id: "s2", main_teacher: "g1", status: "ينتظر" },
    { _id: "s3", main_teacher: "g2", status: "عادي" },
    { _id: "s9", main_teacher: "g1", status: "عادي" },
  ]);
  return { lessons, students, edu: createEducationalLessons({ lessons, students, now: () => new Date("2026-11-05") }) };
}

test("every accepted student of the guide joins the educational lesson, once", async () => {
  const { edu, lessons } = setup();
  assert.equal(await edu.enrolAll("g1"), 1);
  assert.deepEqual(lessons.docs[0].list_students, ["s9", "s1"]);
  assert.deepEqual(lessons.docs[2].list_students, [], "a regular lesson is left alone");
  assert.equal(await edu.enrolAll("g1"), 0);
});

test("a guide with no educational lesson changes nothing", async () => {
  const { edu } = setup();
  assert.equal(await edu.enrolAll("nobody"), 0);
});

test("a student who changes guide moves to the new guide's lesson", async () => {
  const { edu, lessons } = setup();
  await edu.moveStudent("s3", "g2", "g1");
  assert.deepEqual(lessons.docs[1].list_students, []);
  assert.deepEqual(lessons.docs[0].list_students, ["s9", "s3"]);
});

test("an approved request joins; the same guide again adds nothing", async () => {
  const { edu, lessons } = setup();
  await edu.moveStudent("s2", null, "g1");
  assert.deepEqual(lessons.docs[0].list_students, ["s9", "s2"]);
  await edu.moveStudent("s2", "g1", "g1");
  assert.deepEqual(lessons.docs[0].list_students, ["s9", "s2"]);
});

test("multiple automatic programs receive students; selected programs retain separate rosters", async () => {
  const { edu, lessons } = setup();
  lessons.docs.push({ _id: "e3", teacher: "g1", kind: "educational", educationalRoster: "all", list_students: [] });
  lessons.docs.push({ _id: "e4", teacher: "g1", kind: "educational", educationalRoster: "selected", list_students: ["s9"] });
  await edu.enrolAll("g1");
  assert.deepEqual(lessons.docs[3].list_students, ["s1", "s9"]);
  assert.deepEqual(lessons.docs[4].list_students, ["s9"]);
  await edu.moveStudent("s3", "g2", "g1");
  assert.ok(lessons.docs[0].list_students.includes("s3"));
  assert.ok(lessons.docs[3].list_students.includes("s3"));
  assert.deepEqual(lessons.docs[4].list_students, ["s9"]);
});

test("saving one program does not reconcile other automatic programs", async () => {
  const { edu, lessons } = setup();
  lessons.docs.push({ _id: "e3", teacher: "g1", kind: "educational", educationalRoster: "all", list_students: [] });
  await edu.enrolAll("g1", "e3");
  assert.deepEqual(lessons.docs[0].list_students, ["s9"]);
  assert.deepEqual(lessons.docs[3].list_students, ["s1", "s9"]);
});

test("changing responsibility removes the student from every old subset; new subsets remain manual", async () => {
  const { edu, lessons } = setup();
  lessons.docs.push({ _id: "e3", teacher: "g2", kind: "educational", educationalRoster: "selected", list_students: ["s3"] });
  lessons.docs.push({ _id: "e4", teacher: "g1", kind: "educational", educationalRoster: "selected", list_students: [] });
  await edu.moveStudent("s3", "g2", "g1");
  assert.deepEqual(lessons.docs[1].list_students, []);
  assert.deepEqual(lessons.docs[3].list_students, []);
  assert.deepEqual(lessons.docs[4].list_students, []);
});

test("a concurrent switch to selected membership prevents an automatic retry from adding students", async () => {
  const { edu, lessons } = setup();
  const update = lessons.updateExisting;
  let raced = false;
  lessons.updateExisting = async (filter, data) => {
    if (!raced) { raced = true; lessons.docs[0].educationalRoster = "selected"; lessons.docs[0].updatedAt = new Date("2026-11-06"); }
    return update(filter, data);
  };
  await edu.moveStudent("s1", null, "g1");
  assert.deepEqual(lessons.docs[0].list_students, ["s9"]);
});

test("simultaneous automatic additions preserve both students using a fresh roster on conflict", async () => {
  const { edu, lessons } = setup();
  await Promise.all([edu.moveStudent("s1", null, "g1"), edu.moveStudent("s2", null, "g1")]);
  assert.deepEqual([...lessons.docs[0].list_students].sort(), ["s1", "s2", "s9"]);
  assert.equal(new Set(lessons.docs[0].list_students).size, 3);
});

test("a competing roster change during automatic removal is preserved", async () => {
  const { edu, lessons } = setup();
  const update = lessons.updateExisting;
  let raced = false;
  lessons.updateExisting = async (filter, data) => {
    if (!raced) { raced = true; lessons.docs[1].list_students.push("unrelated"); lessons.docs[1].updatedAt = new Date("2026-11-06"); }
    return update(filter, data);
  };
  await edu.moveStudent("s3", "g2", "g1");
  assert.deepEqual(lessons.docs[1].list_students, ["unrelated"]);
});

test("student guide changes request locks for old and new educational programs", async () => {
  const { lessons, students } = setup();
  const asked = [];
  const req = { actor: { id: "staff" } };
  const edu = createEducationalLessons({ lessons, students, lockPrograms: async (keys, request) => { asked.push([keys, request]); return async () => {}; } });
  await edu.holdForStudentChange("g1", "g2", req);
  assert.deepEqual(asked, [[["lesson:e1", "lesson:e2"], req]]);
  lessons.docs.push({ _id: "e3", teacher: "g1", kind: "educational", educationalRoster: "selected", list_students: [] });
  await edu.holdForStudentChange("g1", "g1", req);
  assert.deepEqual(asked[1], [["lesson:e1", "lesson:e3"], req]);
});
