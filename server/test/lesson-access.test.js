const assert = require("node:assert/strict");
const test = require("node:test");
const { actorFor } = require("./helpers/actors");
const { seesAllLessons, isOnLesson, mayOpenLesson, ownLessons } = require("../utils/lessonAccess");

// The owner's rule (2026-11-01): a guide or assistant sees only the lessons
// he teaches or assists in; lessons.viewAll (an admin) sees every lesson.

const ADMIN = actorFor({ _id: "a".repeat(24), tz: "1", roles: ["ادارة"] });
const GUIDE = actorFor({ _id: "b".repeat(24), tz: "2", roles: ["مرشد"] });
const HELPER = actorFor({ _id: "c".repeat(24), tz: "3", roles: ["مساعد"] });

const TEACHES = { _id: "L1", teacher: "b".repeat(24), helper: null };
const HELPS = { _id: "L2", teacher: "d".repeat(24), helper: "c".repeat(24) };
const OTHER = { _id: "L3", teacher: "d".repeat(24), helper: "e".repeat(24) };
const ALL = [TEACHES, HELPS, OTHER];

test("an admin sees every lesson", () => {
  assert.equal(seesAllLessons(ADMIN), true);
  assert.deepEqual(ownLessons(ADMIN, ALL).map((l) => l._id), ["L1", "L2", "L3"]);
  assert.equal(mayOpenLesson(ADMIN, OTHER), true);
});

test("a guide sees only the lessons he teaches", () => {
  assert.equal(seesAllLessons(GUIDE), false);
  assert.deepEqual(ownLessons(GUIDE, ALL).map((l) => l._id), ["L1"]);
  assert.equal(mayOpenLesson(GUIDE, TEACHES), true);
  assert.equal(mayOpenLesson(GUIDE, OTHER), false);
});

test("an assistant sees only the lessons he helps in", () => {
  assert.deepEqual(ownLessons(HELPER, ALL).map((l) => l._id), ["L2"]);
  assert.equal(mayOpenLesson(HELPER, TEACHES), false);
});

test("ids stored as ObjectIds match too; no actor id matches nothing", () => {
  const { Types } = require("mongoose");
  assert.equal(isOnLesson(GUIDE, { teacher: new Types.ObjectId("b".repeat(24)) }), true);
  assert.equal(isOnLesson({ id: "" }, { teacher: "" }), false);
  assert.equal(isOnLesson(GUIDE, null), false);
  assert.deepEqual(ownLessons(GUIDE, null), []);
});

// The owner's rule (2026-11-01): the responsible guide sees everything about
// his student, so a lesson holding one of his students opens for him (to
// view), even when another guide teaches it.
const { mayViewLesson, responsibleStudentIds } = require("../utils/lessonAccess");

test("a lesson holding one of the guide's responsible students may be viewed by him", () => {
  const mine = new Set(["s1"]);
  assert.equal(mayViewLesson(GUIDE, { ...OTHER, list_students: ["s9", "s1"] }, mine), true);
  assert.equal(mayViewLesson(GUIDE, { ...OTHER, list_students: ["s9"] }, mine), false);
  assert.equal(mayViewLesson(GUIDE, TEACHES, new Set()), true);
  assert.equal(mayViewLesson(ADMIN, OTHER, new Set()), true);
});

test("responsibleStudentIds: the _ids of the guide's students; null for an admin; empty without an id", async () => {
  const seen = [];
  const model = { async get(filter) { seen.push(filter); return { result: [{ _id: "s1" }, { _id: "s2" }] }; } };
  assert.deepEqual([...(await responsibleStudentIds(model, GUIDE))], ["s1", "s2"]);
  assert.equal(await responsibleStudentIds(model, ADMIN), null);
  assert.deepEqual([...(await responsibleStudentIds(model, { id: "" }))], []);
  assert.equal(seen.length, 1, "no lookup for an admin or an empty id");
});

test("isResponsible needs a real id on both sides", () => {
  const { isResponsible } = require("../utils/lessonAccess");
  assert.equal(isResponsible({ main_teacher: "b".repeat(24) }, GUIDE), true);
  assert.equal(isResponsible({ main_teacher: "" }, { id: "" }), false);
  assert.equal(isResponsible({ main_teacher: null }, GUIDE), false);
  assert.equal(isResponsible(null, GUIDE), false);
});
