// POST /api/students/:id/make-staff (owner, 2026-11-19; testing review
// 2026-11-20): both permission keys on the route, the student scope, a resume
// through the planned programs, and change notices only on success.
// Synthetic ids and names only.
const assert = require("node:assert/strict");
const live = require("./helpers/liveStubs");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { auditStub } = require("./helpers/auditStub");
const { actorFor } = require("./helpers/actors");

const id = (c) => c.repeat(24);
const STUDENT_ID = id("5");
const OTHER_STUDENT = id("6");
const GUIDE = { _id: id("b"), tz: "900000002", firstname: "مرشد", lastname: "ب", role: "مرشد" };
const OTHER_GUIDE = { _id: id("c"), tz: "900000003", firstname: "مرشد", lastname: "ج", role: "مرشد" };
const ADMIN = { _id: id("a"), tz: "900000001", firstname: "مدير", lastname: "أ", role: "ادارة" };

// Mongo-like filters the code uses: equality (string compare, null = missing),
// dotted paths, $in, $or, $lt.
function store(seed = []) {
  let docs = seed.map((d) => structuredClone(d));
  const at = (doc, key) => key.split(".").reduce((v, k) => (v == null ? undefined : v[k]), doc);
  const stamp = (v) => (v instanceof Date ? v.toISOString() : String(v));
  const one = (value, cond) => {
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      if ("$in" in cond) return cond.$in.some((c) => (Array.isArray(value) ? value : [value]).some((v) => String(v) === String(c)));
      if ("$lt" in cond) return value != null && new Date(value) < new Date(cond.$lt);
    }
    if (cond === null) return value == null;
    if (Array.isArray(value)) return value.some((v) => stamp(v) === stamp(cond));
    return value != null && stamp(value) === stamp(cond);
  };
  const matches = (doc, filter = {}) => Object.entries(filter).every(([k, v]) => (k === "$or" ? v.some((f) => matches(doc, f)) : one(at(doc, k), v)));
  const set = (doc, key, value) => {
    const parts = key.split(".");
    let cur = doc;
    for (const p of parts.slice(0, -1)) { if (cur[p] == null || typeof cur[p] !== "object") cur[p] = {}; cur = cur[p]; }
    cur[parts.at(-1)] = structuredClone(value);
  };
  return {
    all: () => docs,
    async get(filter = {}) { return { success: true, result: docs.filter((d) => matches(d, filter)).map((d) => structuredClone(d)) }; },
    async create(data) { docs.push(structuredClone(data)); return { success: true, result: structuredClone(data) }; },
    async updateExisting(filter, patch) {
      const doc = docs.find((d) => matches(d, filter));
      if (!doc) return { success: true, result: null };
      for (const [k, v] of Object.entries(patch)) set(doc, k, v);
      return { success: true, result: structuredClone(doc) };
    },
    async delete(filter) { const before = docs.length; docs = docs.filter((d) => !matches(d, filter)); return { success: true, result: { deletedCount: before - docs.length } }; },
  };
}

function world({ student = {}, lessons } = {}) {
  const students = store([
    { _id: STUDENT_ID, tz: "000000018", firstname: "علي", lastname: "طالب", status: "عادي", main_teacher: GUIDE._id, ...student },
    { _id: OTHER_STUDENT, tz: "000000026", firstname: "آخر", lastname: "", status: "عادي", main_teacher: OTHER_GUIDE._id },
  ]);
  const lessonStore = store(lessons || [{ _id: id("1"), teacher: GUIDE._id, list_students: [STUDENT_ID], list_users: [], updatedAt: new Date("2026-11-01") }]);
  const users = store([]);
  const attendance = store([]);
  const audit = auditStub();
  let next = 0;
  const deps = {
    crypto: require("node:crypto"),
    mongoose: { Types: { ObjectId: class { constructor(v) { this.v = v || (next += 1).toString(16).padStart(24, "e"); } toString() { return this.v; } } } },
    "../../middleware/logger": { logWithSource() {} },
    "../../utils/studentScope": require("../utils/studentScope"),
    "../../services/staffConversion": require("../services/staffConversion"),
    "./Student.model": { StudentModelDef: students },
    "../Lesson/Lesson.model": { LessonModelDef: lessonStore },
    "../User/User.model": { UserModelDef: users },
    "../Attendance/Attendance.model": { AttendanceModelDef: attendance },
    "../User/User.controller": {
      async createUserFromStudent({ student: s, conv }) { await users.create({ _id: conv.userId, tz: s.tz, fromStudentId: String(s._id) }); return {}; },
      async copyStudentPhotoToUser() {},
      async findStaffByTz(tz) { const user = (await users.get({ tz })).result[0]; return user ? { user, room: user.room || "active" } : null; },
      async linkUserToStudent({ student: s, conv }) { await users.updateExisting({ _id: conv.userId }, { fromStudentId: String(s._id) }); return {}; },
      mayGiveStaffRole: (actor, role) => role !== "ادارة" || actor.role === "ادارة",
    },
    ...audit.deps,
  };
  const filename = path.join(__dirname, "../Entities/Student/StaffConversion.controller.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, console: { log() {}, warn() {}, error() {} },
    require(name) {
      if (Object.hasOwn(deps, name)) return deps[name];
      if (Object.hasOwn(live.deps, name)) return live.deps[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
  }, { filename });
  return { controller: module.exports, students, users, lessons: lessonStore };
}

async function call(w, user, studentId, body = { role: "مساعد", password: "Secret-123", phone: "0501111111" }) {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = JSON.parse(JSON.stringify(v)); return this; } };
  await w.controller.makeStaff({ actor: actorFor(user), params: { id: studentId }, body, headers: {} }, res);
  return res;
}

test("the route needs both students.makeStaff and users.create", () => {
  const source = fs.readFileSync(path.join(__dirname, "../Entities/Student/Student.route.js"), "utf8");
  const line = source.split("\n").find((l) => l.includes("/:id/make-staff"));
  assert.ok(line, "the route exists");
  assert.match(line, /requirePermission\('students\.makeStaff'\)/);
  assert.match(line, /requirePermission\('users\.create'\)/);
});

test("a guide converts his own student; changes are announced only on success", async () => {
  live.changes.length = 0;
  const w = world();
  const res = await call(w, GUIDE, STUDENT_ID);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.ok(live.changes.some(([kind, x]) => kind === "student" && x === STUDENT_ID));
  assert.ok(live.changes.some(([kind]) => kind === "user"));

  live.changes.length = 0;
  const again = await call(w, GUIDE, STUDENT_ID);
  assert.equal(again.statusCode, 409);
  assert.equal(live.changes.length, 0, "no notice on a refusal");
});

test("a guide limited to his own students gets 404 for another guide's student", async () => {
  const w = world();
  const res = await call(w, GUIDE, OTHER_STUDENT);
  assert.equal(res.statusCode, 404);
  assert.equal(w.students.all()[1].staffConversion, undefined, "nothing changed");
});

test("a stopped conversion is resumed through a planned program; a guide on none gets 404", async () => {
  // Stopped after the moves began: the student is off the roster and the
  // guide is no longer his responsible guide, but teaches a planned program.
  const conv = { phase: "account", role: "مساعد", userId: id("d"), cutoverDateKey: 20261120, plannedLessons: [id("1")], movedLessons: [id("1")] };
  const lessons = [{ _id: id("1"), teacher: GUIDE._id, list_students: [], list_users: [id("d")], updatedAt: new Date("2026-11-01") }];
  const w = world({ student: { main_teacher: ADMIN._id, staffConversion: conv }, lessons });
  await w.users.create({ _id: id("d"), tz: "000000018", fromStudentId: STUDENT_ID });
  assert.equal((await call(w, OTHER_GUIDE, STUDENT_ID, {})).statusCode, 404);
  const res = await call(w, GUIDE, STUDENT_ID, {});
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(w.students.all()[0].staffConversion.phase, "done");
});

/* ---------- owner, 2026-11-26: the window's first look, and linking ---------- */
async function look(w, user, studentId) {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = JSON.parse(JSON.stringify(v)); return this; } };
  await w.controller.makeStaffPreview({ actor: actorFor(user), params: { id: studentId }, headers: {} }, res);
  return res;
}

test("the window's first look has its own route with the same two keys", () => {
  const source = fs.readFileSync(path.join(__dirname, "../Entities/Student/Student.route.js"), "utf8");
  const line = source.split("\n").find((l) => l.startsWith("router.get('/:id/make-staff'"));
  assert.ok(line, "the route exists");
  assert.match(line, /requirePermission\('students\.makeStaff'\)/);
  assert.match(line, /requirePermission\('users\.create'\)/);
});

test("the first look keeps the student scope, and shows staff with his ID number", async () => {
  const w = world();
  assert.equal((await look(w, GUIDE, OTHER_STUDENT)).statusCode, 404);
  assert.deepEqual((await look(w, GUIDE, STUDENT_ID)).body, { ok: true, existing: null });
  await w.users.create({ _id: id("f"), tz: "000000018", firstname: "علي", lastname: "موظف", role: "ادارة" });
  const guideSees = (await look(w, GUIDE, STUDENT_ID)).body.existing;
  assert.equal(guideSees.mayLink, false, "a guide may not link to a manager's account");
  assert.equal(guideSees.userId, undefined, "the account id is not sent");
  assert.equal((await look(w, ADMIN, STUDENT_ID)).body.existing.mayLink, true);
});

test("a guide cannot link his student to a manager's account; the manager can", async () => {
  const w = world();
  await w.users.create({ _id: id("f"), tz: "000000018", firstname: "علي", lastname: "موظف", role: "ادارة" });
  const refused = await call(w, GUIDE, STUDENT_ID, {});
  assert.equal(refused.statusCode, 403);
  assert.equal(w.students.all()[0].staffConversion, undefined);
  const res = await call(w, ADMIN, STUDENT_ID, {});
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(res.body.linked, true);
  assert.equal(w.users.all().length, 1, "no second account");
  assert.equal(w.users.all()[0].fromStudentId, STUDENT_ID);
  assert.deepEqual(w.lessons.all()[0].list_users, [id("f")]);
});
