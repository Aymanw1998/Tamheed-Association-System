const assert = require("node:assert/strict");
const test = require("node:test");

const { createStudentScope, mergeRoster } = require("../utils/studentScope");

function fakeLessons(lessons) {
  return {
    async get(filter) {
      const result = lessons.filter((l) =>
        Object.entries(filter).every(([k, v]) => l[k] === v));
      return { success: true, result };
    },
  };
}
function fakeStudents(students) {
  return {
    async get(filter) {
      const result = students.filter((s) =>
        Object.entries(filter).every(([k, v]) => s[k] === v));
      return { success: true, result };
    },
  };
}
const actor = (perms, id = "g1") => ({ id, permissions: new Set(perms) });

test("viewAll sees everything (null)", async () => {
  const scope = createStudentScope({ lessonModel: fakeLessons([]), studentModel: fakeStudents([]) });
  assert.equal(await scope.visibleStudentIds(actor(["students.viewAll"])), null);
});

test("guide sees responsible students and lesson students only", async () => {
  const scope = createStudentScope({
    lessonModel: fakeLessons([
      { teacher: "g1", helper: null, list_students: ["s2", "s3"] },
      { teacher: "x", helper: "g1", list_students: ["s4"] },
      { teacher: "x", helper: "y", list_students: ["s9"] },
    ]),
    studentModel: fakeStudents([
      { _id: "s1", main_teacher: "g1" },
      { _id: "s8", main_teacher: "other" },
    ]),
  });
  const ids = await scope.visibleStudentIds(actor(["students.view"]));
  assert.deepEqual([...ids].sort(), ["s1", "s2", "s3", "s4"]);
});

test("mergeRoster follows submitted then appends hidden ids", () => {
  assert.deepEqual(mergeRoster(["a", "b", "h"], ["a", "c"], new Set(["a", "b", "c"])), ["a", "c", "h"]);
});

test("mergeRoster ignores submitted ids outside visible", () => {
  assert.deepEqual(mergeRoster(["h"], ["a", "z"], new Set(["a"])), ["a", "h"]);
});

test("mergeRoster with null returns submitted", () => {
  assert.deepEqual(mergeRoster(["a", "h"], ["c"], null), ["c"]);
});

test("an actor without an id sees nothing (explicit empty Set, no lookups)", async () => {
  const boom = { async get() { throw new Error("must not query"); } };
  const scope = createStudentScope({ lessonModel: boom, studentModel: boom });
  for (const a of [actor(["students.view"], ""), { permissions: new Set(["students.view"]) }, undefined, null]) {
    const ids = await scope.visibleStudentIds(a);
    assert.ok(ids instanceof Set);
    assert.equal(ids.size, 0);
  }
});

test("a 24-hex actor id is queried as both string and ObjectId ($in)", async () => {
  const { Types } = require("mongoose");
  const id = "b".repeat(24);
  const filters = [];
  const recorder = { async get(filter) { filters.push(filter); return { success: true, result: [] }; } };
  const scope = createStudentScope({ lessonModel: recorder, studentModel: recorder });
  await scope.visibleStudentIds(actor(["students.view"], id));
  assert.equal(filters.length, 3);
  const byField = Object.fromEntries(filters.map((f) => Object.entries(f)[0]));
  for (const field of ["teacher", "helper", "main_teacher"]) {
    const values = byField[field]?.$in;
    assert.ok(Array.isArray(values), `${field} uses $in`);
    assert.equal(values.length, 2, field);
    assert.equal(values[0], id, `${field} string form`);
    assert.ok(values[1] instanceof Types.ObjectId, `${field} ObjectId form`);
    assert.equal(String(values[1]), id);
  }
});

test("a non-hex actor id is queried as a plain string", async () => {
  const filters = [];
  const recorder = { async get(filter) { filters.push(filter); return { success: true, result: [] }; } };
  const scope = createStudentScope({ lessonModel: recorder, studentModel: recorder });
  await scope.visibleStudentIds(actor(["students.view"], "legacy-1"));
  assert.deepEqual(filters.map((f) => Object.values(f)[0]), ["legacy-1", "legacy-1", "legacy-1"]);
});

test("the schema-less generic model keeps both $in forms when mongoose casts the filter", () => {
  const mongoose = require("mongoose");
  const local = new mongoose.Mongoose();
  // Same schema options as Entities/api.js genericSchema.
  const Model = local.model("ScopeCast", new local.Schema({}, { strict: false, minimize: false }), "ScopeCast");
  const id = "b".repeat(24);
  const query = Model.find({ teacher: { $in: [id, new mongoose.Types.ObjectId(id)] } });
  query.cast(Model);
  const [asString, asObjectId] = query.getFilter().teacher.$in;
  assert.equal(typeof asString, "string");
  assert.equal(asObjectId?.constructor?.name, "ObjectId");
  assert.equal(String(asObjectId), id);
});

test("mergeRoster tolerates a missing existing roster", () => {
  assert.deepEqual(mergeRoster(undefined, ["a", "z"], new Set(["a"])), ["a"]);
  assert.deepEqual(mergeRoster(null, ["a"], new Set(["a"])), ["a"]);
});

test("mergeRoster drops duplicate submitted ids", () => {
  assert.deepEqual(mergeRoster(["h"], ["a", "a", "b", "a"], new Set(["a", "b"])), ["a", "b", "h"]);
});

test("mergeRoster with an empty visible Set keeps the existing roster as is", () => {
  assert.deepEqual(mergeRoster(["h1", "h2"], ["a"], new Set()), ["h1", "h2"]);
});
