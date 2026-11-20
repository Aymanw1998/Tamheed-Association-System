const assert = require("node:assert/strict");
const test = require("node:test");
const { actorFor } = require("./helpers/actors");
const { mayRecordAttendance } = require("../utils/attendanceRecord");
const { requireAttendanceRecord } = require("../middleware/attendanceRecordGuard");

// An assistant in charge of a program records its attendance (owner,
// 2026-11-19); a revoke of attendance.record or of the attendance module
// takes it away. Synthetic ids only.
const id = (c) => c.repeat(24);
const ASSIST = { _id: id("c"), tz: "900000003", role: "مساعد", roles: ["مساعد"] };
const GUIDE = { _id: id("b"), tz: "900000002", role: "مرشد", roles: ["مرشد"] };
const PROGRAM = { _id: id("1"), teacher: ASSIST._id };
const OTHER = { _id: id("2"), teacher: GUIDE._id, helper: ASSIST._id };

test("an assistant records only where he is «المسؤول»; a guide keeps his key everywhere", () => {
  assert.equal(mayRecordAttendance(actorFor(ASSIST), PROGRAM), true);
  assert.equal(mayRecordAttendance(actorFor(ASSIST), OTHER), false, "helper is not in charge");
  assert.equal(mayRecordAttendance(actorFor(GUIDE), PROGRAM), true);
});

test("a revoke of attendance.record or of the attendance module takes it away", () => {
  for (const revokes of [["attendance.record"], ["attendance"]]) {
    assert.equal(mayRecordAttendance(actorFor({ ...ASSIST, permissionRevokes: revokes }), PROGRAM), false, revokes[0]);
  }
});

async function run(guard, user, body) {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } };
  let passed = false;
  await guard({ actor: actorFor(user), body }, res, () => { passed = true; });
  return { passed, res };
}

test("bulk-save guard: in charge passes, not in charge 403, failed read 503", async () => {
  const lessons = { get: async (f) => ({ success: true, result: [PROGRAM, OTHER].filter((l) => l._id === String(f._id)) }) };
  assert.equal((await run(requireAttendanceRecord(lessons), ASSIST, { lessonId: PROGRAM._id })).passed, true);
  const out = await run(requireAttendanceRecord(lessons), ASSIST, { lessonId: OTHER._id });
  assert.equal(out.passed, false);
  assert.equal(out.res.statusCode, 403);
  const broken = { get: async () => ({ success: false }) };
  const failed = await run(requireAttendanceRecord(broken), ASSIST, { lessonId: PROGRAM._id });
  assert.equal(failed.res.statusCode, 503);
  assert.equal((await run(requireAttendanceRecord(broken), GUIDE, { lessonId: PROGRAM._id })).passed, true, "a key holder is not looked up");
});
