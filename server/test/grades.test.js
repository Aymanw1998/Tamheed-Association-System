const assert = require("node:assert/strict");
const test = require("node:test");
const { canonicalGrade, nextGrade, NO_GRADE, UNIVERSITY } = require("../utils/grades");
const { createGradePromotion } = require("../services/gradePromotionJob");

test("what was typed before the list is read only with certainty", () => {
  for (const [typed, grade] of [["السادس", "سادس"], ["الصف الثالث", "ثالث"], ["3", "ثالث"], ["٣", "ثالث"], ["صف أول", "اول"], ["الأول", "اول"],
    ["الحادي عشر", "احد عشر"], ["الثاني عشر", "ثاني عشر"], ["ثاني عشر", "ثاني عشر"], ["12", "ثاني عشر"], ["روضة", "روضة"], ["جامعي", UNIVERSITY], ["لا يوجد صف", NO_GRADE]]) {
    assert.equal(canonicalGrade(typed), grade, typed);
  }
  for (const typed of ["", "ز", "13", "0", "something", "ثالث ب"]) assert.equal(canonicalGrade(typed), "", typed);
});

test("each class moves up one; after ثاني عشر there is no class", () => {
  assert.equal(nextGrade("روضة"), "اول");
  assert.equal(nextGrade("اول"), "ثاني");
  assert.equal(nextGrade("ثاني"), "ثالث");
  assert.equal(nextGrade("عاشر"), "احد عشر");
  assert.equal(nextGrade("احد عشر"), "ثاني عشر");
  assert.equal(nextGrade("ثاني عشر"), NO_GRADE);
  assert.equal(nextGrade(UNIVERSITY), UNIVERSITY);
  assert.equal(nextGrade(NO_GRADE), NO_GRADE);
});

function setup(students, nowText, { failOn = null } = {}) {
  const rows = students.map((student, i) => ({ _id: `s${i}`, createdAt: "2026-01-01T00:00:00Z", ...student }));
  const finished = [];
  const announced = [];
  const run = createGradePromotion({
    listStudents: async () => rows,
    updateStudent: async (student, change) => {
      if (failOn === student.layer) throw new Error("down");
      Object.assign(student, change);
    },
    hasFinished: async (date) => finished.includes(date),
    markFinished: async (date) => finished.push(date),
    announce: async (info) => announced.push(info),
    now: () => new Date(nowText),
  });
  return { rows, run, finished, announced };
}

test("nothing moves before July 1st, or at all before 2027, even after a deploy in the autumn", async () => {
  for (const when of ["2026-11-05T10:00:00Z", "2026-07-01T10:00:00Z", "2027-06-30T20:00:00Z"]) {
    const { rows, run } = setup([{ layer: "اول" }], when);
    assert.deepEqual(await run(), { skipped: true });
    assert.equal(rows[0].layer, "اول");
  }
});

test("on July 1st Israel time everyone moves once, and a second run changes nothing", async () => {
  const { rows, run, announced } = setup([{ layer: "اول" }, { layer: "ثاني عشر" }, { layer: "جامعي" }, { layer: "الصف الثالث" }], "2027-06-30T21:30:00Z");
  const first = await run();
  assert.deepEqual(rows.map((r) => r.layer), ["ثاني", NO_GRADE, UNIVERSITY, "رابع"]);
  assert.equal(first.moved, 4);
  assert.equal((await run()).skipped, true);
  assert.deepEqual(rows.map((r) => r.layer), ["ثاني", NO_GRADE, UNIVERSITY, "رابع"]);
  assert.equal(announced.length, 1);
});

test("a server that was down on the day catches up, without moving those who joined after it", async () => {
  const { rows, run } = setup([{ layer: "اول" }, { layer: "اول", createdAt: "2027-08-20T09:00:00Z" }], "2027-09-01T09:00:00Z");
  await run();
  assert.deepEqual(rows.map((r) => r.layer), ["ثاني", "اول"]);
});

test("years missed while the server was down are made up, also before the next July", async () => {
  const first = setup([{ layer: "اول" }], "2028-01-15T09:00:00Z");
  await first.run();
  assert.equal(first.rows[0].layer, "ثاني");
  const second = setup([{ layer: "اول" }], "2028-07-02T09:00:00Z");
  await second.run();
  assert.equal(second.rows[0].layer, "ثالث");
  assert.equal(second.announced.length, 2);
});

test("a student moved for a later year is not moved again for an earlier one", async () => {
  const { rows, run } = setup([{ layer: "ثالث", gradePromotedYear: 2028 }], "2028-07-02T09:00:00Z");
  await run();
  assert.equal(rows[0].layer, "ثالث");
});

test("a class that cannot be read stays as typed and is reported", async () => {
  const { rows, run, announced } = setup([{ layer: "ثالث ب" }, { layer: "" }], "2027-07-01T09:00:00Z");
  const out = await run();
  assert.deepEqual(rows.map((r) => r.layer), ["ثالث ب", ""]);
  assert.equal(out.unread, 1);
  assert.equal(announced[0].unread, 1);
});

test("a write that fails keeps the run open; the next run moves only the one left", async () => {
  const ctx = setup([{ layer: "اول" }, { layer: "رابع" }], "2027-07-01T09:00:00Z", { failOn: "رابع" });
  const first = await ctx.run();
  assert.equal(first.failed, 1);
  assert.deepEqual(ctx.finished, []);
  assert.deepEqual(ctx.rows.map((r) => r.layer), ["ثاني", "رابع"]);
  // The same store, the write healed.
  const healed = createGradePromotion({
    listStudents: async () => ctx.rows,
    updateStudent: async (student, change) => Object.assign(student, change),
    hasFinished: async () => false,
    markFinished: async () => {},
    announce: async () => {},
    now: () => new Date("2027-07-02T09:00:00Z"),
  });
  await healed();
  assert.deepEqual(ctx.rows.map((r) => r.layer), ["ثاني", "خامس"]);
});
