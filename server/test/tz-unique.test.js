const assert = require("node:assert/strict");
const test = require("node:test");

const { TZ_UNIQUE_INDEX, isDuplicateKey } = require("../utils/tzUnique");
const { STUDENT_INDEXES, ensureStudentIndexes } = require("../Entities/Student/Student.model");
// User.model loads the password cipher, which needs a key: a test key, never a real one.
process.env.PASSWORD_ENC_KEY_HEX = process.env.PASSWORD_ENC_KEY_HEX || "ab".repeat(32);
const { USER_INDEXES, ensureUserIndexes, UserModelDef } = require("../Entities/User/User.model");

// Owner, 2026-11-03: one record per ID number, kept by the database itself
// (a unique index), not only by the check before a save.

test("the tz index is unique and skips records without an ID number", () => {
  assert.deepEqual(TZ_UNIQUE_INDEX.key, { tz: 1 });
  assert.equal(TZ_UNIQUE_INDEX.options.unique, true);
  assert.deepEqual(TZ_UNIQUE_INDEX.options.partialFilterExpression, { tz: { $gt: "" } });
  assert.deepEqual(STUDENT_INDEXES, [TZ_UNIQUE_INDEX]);
  assert.deepEqual(USER_INDEXES, [TZ_UNIQUE_INDEX]);
});

test("isDuplicateKey knows MongoDB's duplicate-key error and nothing else", () => {
  assert.equal(isDuplicateKey({ code: 11000 }), true);
  assert.equal(isDuplicateKey(new Error("E11000 duplicate key error")), true);
  assert.equal(isDuplicateKey(new Error("network")), false);
  assert.equal(isDuplicateKey(null), false);
});

const fakeCollection = (name, made) => ({ async createIndex(key, options) { made.push([name, key, options]); } });

test("students get the index on their collection", async () => {
  const made = [];
  await ensureStudentIndexes(fakeCollection("Students", made));
  assert.deepEqual(made, [["Students", { tz: 1 }, TZ_UNIQUE_INDEX.options]]);
});

test("users get the index in each of the three rooms", async () => {
  const made = [];
  await ensureUserIndexes((name) => fakeCollection(name, made));
  assert.deepEqual(made.map(([name]) => name).sort(), Object.values(UserModelDef.collections).sort());
  for (const [, key, options] of made) {
    assert.deepEqual(key, { tz: 1 });
    assert.equal(options.unique, true);
  }
});

test("findDuplicateTz lists an ID number held twice in one collection, not across collections", () => {
  const { findDuplicateTz } = require("../scripts/findDuplicateTz");
  const found = findDuplicateTz([
    { collection: "Students", docs: [{ tz: "800000001" }, { tz: "800000001" }, { tz: "800000002" }, { tz: "" }, { tz: "" }] },
    { collection: "Users", docs: [{ tz: "800000001" }] },
  ]);
  assert.deepEqual(found, [{ collection: "Students", tz: "800000001", count: 2 }]);
});
