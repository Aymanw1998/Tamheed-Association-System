const assert = require("node:assert/strict");
const test = require("node:test");
const { memoryModel } = require("./helpers/memoryModel");
const {
  staffIds, staffClash, isParticipant, addableUsers, activeUsers, CLASH,
} = require("../utils/lessonParticipants");

// Users as lesson participants (owner, 2026-11-09). Synthetic ids only.
const T = "1".repeat(24); // teacher
const H = "2".repeat(24); // helper
const U1 = "3".repeat(24);
const U2 = "4".repeat(24);
const IT_ONLY = "5".repeat(24); // an IT account without an everyday role: hidden
const GONE = "6".repeat(24); // moved out of the active collection

const users = () => memoryModel({
  active: [
    { _id: T, tz: "900000011", firstname: "مرشد", lastname: "أ", role: "مرشد" },
    { _id: H, tz: "900000012", firstname: "مساعد", lastname: "ب", role: "مساعد" },
    { _id: U1, tz: "900000013", firstname: "موظف", lastname: "ج", role: "مساعد" },
    { _id: U2, tz: "900000014", firstname: "موظفة", lastname: "د", role: "مرشد" },
    { _id: IT_ONLY, tz: "900000015", firstname: "تقني", lastname: "", isIT: true },
  ],
  noActive: [{ _id: GONE, tz: "900000016", firstname: "سابق", lastname: "", role: "مساعد" }],
});

const lesson = (extra = {}) => ({ _id: "L1", teacher: T, helper: H, list_users: [], ...extra });

test("staffIds holds the teacher and the helper, without empty values", () => {
  assert.deepEqual([...staffIds(lesson())].sort(), [T, H].sort());
  assert.deepEqual([...staffIds(lesson({ helper: null }))], [T]);
});

test("staffClash names a teacher or helper who is also listed as a participant", () => {
  assert.deepEqual(staffClash(lesson({ list_users: [U1] })), []);
  assert.deepEqual(staffClash(lesson({ list_users: [U1, H] })), [H]);
});

test("isParticipant is true only for a listed user", () => {
  assert.equal(isParticipant({ id: U1 }, lesson({ list_users: [U1] })), true);
  assert.equal(isParticipant({ id: T }, lesson({ list_users: [U1] })), false);
  assert.equal(isParticipant({}, lesson({ list_users: [U1] })), false);
});

test("addableUsers refuses the lesson's staff and unknown or hidden accounts", async () => {
  const { ids, refused } = await addableUsers(users(), [U1, T, IT_ONLY, GONE, "not-an-id"], lesson());
  assert.deepEqual(ids, [U1]);
  assert.deepEqual(refused, [
    { id: T, reason: "STAFF" },
    { id: IT_ONLY, reason: "NOT_FOUND" },
    { id: GONE, reason: "NOT_FOUND" },
    { id: "not-an-id", reason: "NOT_FOUND" },
  ]);
});

test("addableUsers drops duplicates and users already on the lesson, keeping order", async () => {
  const { ids, refused } = await addableUsers(users(), [U2, U1, U2], lesson({ list_users: [U1] }));
  assert.deepEqual(ids, [U2]);
  assert.deepEqual(refused, []);
});

test("activeUsers lists only active, visible users with their names, in order", async () => {
  assert.deepEqual(await activeUsers(users(), [U2, GONE, IT_ONLY, U1]), [
    { _id: U2, name: "موظفة د" },
    { _id: U1, name: "موظف ج" },
  ]);
});

test("the clash answer carries its code", () => {
  assert.equal(CLASH.code, "STAFF_IS_PARTICIPANT");
  assert.equal(CLASH.ok, false);
});
