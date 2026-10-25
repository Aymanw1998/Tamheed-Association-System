const assert = require("node:assert/strict");
const live = require("./helpers/liveStubs");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { actorFor } = require("./helpers/actors");
const { auditStub } = require("./helpers/auditStub");

// The student scope applied in the Student, Lesson and Attendance controllers.
// A guide (no students.viewAll) sees the students he is responsible for and
// the students in lessons he teaches or helps; everything else is hidden.

// In-memory stand-in for the generic model CRUD (upserting update, like api.js).
function createStore(seed = []) {
  let docs = seed.map((doc, i) => ({ _id: doc._id || `doc-${i}`, ...doc }));
  let next = docs.length;
  const get = (obj, key) => key.split(".").reduce((v, k) => v?.[k], obj);
  // Supports plain equality and { $in: [...] } (compared as strings, like an ObjectId/string pair).
  const matchOne = (value, cond) => (cond && typeof cond === "object" && Array.isArray(cond.$in)
    ? cond.$in.some((c) => String(value) === String(c))
    : String(value) === String(cond));
  const matches = (doc, filter = {}) => Object.keys(filter).every((k) => matchOne(get(doc, k), filter[k]));
  return {
    dbName: "tamheed_db",
    collections: { active: "X" },
    async get(filter = {}) { return { success: true, result: docs.filter((d) => matches(d, filter)).map((d) => structuredClone(d)) }; },
    async create(data) {
      const doc = { _id: `doc-${next++}`, ...structuredClone(data) };
      docs.push(doc);
      return { success: true, result: structuredClone(doc) };
    },
    async update(filter, patch) {
      let hit = false;
      docs = docs.map((d) => (matches(d, filter) ? ((hit = true), { ...d, ...structuredClone(patch) }) : d));
      if (!hit) docs.push({ _id: `doc-${next++}`, ...structuredClone(filter), ...structuredClone(patch) });
      // Like api.update: answers with the document as stored after the write.
      return { success: true, result: structuredClone(docs.find((d) => matches(d, filter)) || null) };
    },
    async delete(filter) { docs = docs.filter((d) => !matches(d, filter)); return { success: true }; },
    all: () => docs,
  };
}

function load(file, dependencies) {
  const filename = path.join(__dirname, "../Entities", file);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, Date, console: { log() {}, warn() {}, error() {} },
    require(name) {
      if (!Object.hasOwn(dependencies, name) && Object.hasOwn(live.deps, name)) return live.deps[name];

      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return module.exports;
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const createRes = () => ({ statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });

/* ================= fixtures (synthetic ids and ID numbers) ================= */
const SYSTEM_TZ = "000000026";
const ADMIN = { _id: "a".repeat(24), tz: "900000001", firstname: "Ad", lastname: "Min", roles: ["ادارة"] };
const GUIDE = { _id: "b".repeat(24), tz: "900000002", firstname: "Gu", lastname: "Ide", roles: ["مرشد"] };
const OTHER = { _id: "c".repeat(24), tz: "900000003", firstname: "Ot", lastname: "Her", roles: ["مرشد"] };
const SYS = { _id: "e".repeat(24), tz: SYSTEM_TZ, firstname: "Sys", lastname: "Tem", roles: [] };
const sid = (n) => `${"5".repeat(23)}${n}`;
const S = [1, 2, 3, 4, 5].map((n) => ({ _id: sid(n), tz: `80000000${n}`, firstname: `F${n}`, lastname: `L${n}`, phone: "0500000000" }));
S[1].main_teacher = GUIDE._id; // s2: the guide is responsible

// L1: the guide teaches s1. L2: another guide's lesson with s3, s4. s5: nobody's.
const LESSONS = () => [
  { _id: "lesson-1", name: "Mine", teacher: GUIDE._id, helper: null, room: "1", date: { day: 2, startMin: 600, endMin: 645 }, list_students: [sid(1)] },
  { _id: "lesson-2", name: "Theirs", teacher: OTHER._id, helper: null, room: "2", date: { day: 2, startMin: 600, endMin: 645 }, list_students: [sid(3), sid(4)] },
];

const reqAs = (user, extra = {}) => ({
  user: { id: user._id, tz: user.tz, roles: user.roles },
  actor: actorFor(user), params: {}, query: {}, body: {}, ...extra,
});

function world() {
  const students = createStore(S);
  const lessons = createStore(LESSONS());
  const users = createStore([ADMIN, GUIDE, OTHER, SYS]);
  const attendance = createStore();
  const audit = auditStub();
  const common = {
    "../../utils/permissions": require("../utils/permissions"),
    "../../utils/studentScope": require("../utils/studentScope"),
    "../../utils/attendanceMarks": require("../utils/attendanceMarks"),
    "../../middleware/logger": { logWithSource() {} },
    "../Notification/Notification.controller": {},
    ...audit.deps,
  };
  const student = load("Student/Student.controller.js", {
    ...common,
    "./Student.model": { StudentModelDef: students },
    "../Lesson/Lesson.model": { LessonModelDef: lessons },
    "../User/User.model": { UserModelDef: users },
    "../UploadFile/file": {
      async handleUpload() { return { secure_url: "https://example.test/new" }; },
      async handleDeleteByUrl() { return { deleted: true }; },
    },
  });
  const lesson = load("Lesson/Lesson.controller.js", {
    ...common,
    "./Lesson.model": { LessonModelDef: lessons },
    "../Sport/SportLesson.model": { SportLessonModelDef: { async get() { return { success: true, result: [] }; } } },
    "../../utils/lessonConflict": require("../utils/lessonConflict"),
    "../Student/Student.model": { StudentModelDef: students },
    "../User/User.model": { UserModelDef: users },
  });
  const att = load("Attendance/Attendance.controller.js", {
    ...common,
    "./Attendance.model": { AttendanceModelDef: attendance },
    "../Lesson/Lesson.model": { LessonModelDef: lessons },
    "../Student/Student.model": { StudentModelDef: students },
    "../User/User.model": { UserModelDef: users },
  });
  return { student, lesson, att, students, lessons, users, attendance, audit };
}

async function call(handler, req) {
  const res = createRes();
  await handler(req, res);
  return res;
}

async function withSystemTz(fn) {
  const had = Object.hasOwn(process.env, "SYSTEM_ADMIN_TZ");
  const previous = process.env.SYSTEM_ADMIN_TZ;
  process.env.SYSTEM_ADMIN_TZ = SYSTEM_TZ;
  try { return await fn(); } finally { if (had) process.env.SYSTEM_ADMIN_TZ = previous; else delete process.env.SYSTEM_ADMIN_TZ; }
}

/* ================= students ================= */

test("a guide's student list holds only his 2 of the 5 students; an admin sees all 5", async () => {
  const w = world();
  const guide = await call(w.student.getAllS, reqAs(GUIDE));
  assert.equal(guide.statusCode, 200);
  assert.deepEqual(guide.body.students.map((s) => s._id).sort(), [sid(1), sid(2)]);

  const admin = await call(w.student.getAllS, reqAs(ADMIN));
  assert.equal(admin.body.students.length, 5);
});

test("a hidden or unknown student answers 404 for a guide on get, edit, photo upload and photo delete", async () => {
  const w = world();
  for (const tz of [S[2].tz, "899999999"]) {
    for (const [name, extra] of [
      ["getOneS", {}],
      ["putS", { body: { firstname: "X" } }],
      ["uploadPhoto", { file: { buffer: "x" } }],
      ["deletePhoto", {}],
    ]) {
      const res = await call(w.student[name], reqAs(GUIDE, { params: { tz }, ...extra }));
      assert.equal(res.statusCode, 404, `${name} ${tz}`);
    }
  }
  // Even with students.delete, a hidden student cannot be deleted.
  const delGuide = { ...GUIDE, permissionGrants: ["students.delete"] };
  const del = await call(w.student.deleteS, reqAs(delGuide, { params: { tz: S[2].tz } }));
  assert.equal(del.statusCode, 404, "deleteS hidden");
  assert.equal(w.students.all().length, 5);
  assert.equal(w.students.all()[2].firstname, "F3", "hidden student unchanged");
  assert.equal(w.audit.calls.length, 0);

  const visible = await call(w.student.getOneS, reqAs(GUIDE, { params: { tz: S[1].tz } }));
  assert.equal(visible.statusCode, 200);
  const edit = await call(w.student.putS, reqAs(GUIDE, { params: { tz: S[0].tz }, body: { firstname: "New" } }));
  assert.equal(edit.statusCode, 200);

  const admin = await call(w.student.getOneS, reqAs(ADMIN, { params: { tz: S[2].tz } }));
  assert.equal(admin.statusCode, 200, "an admin reads any student");
});

test("main_teacher must name an active, non-system user _id", async () => {
  await withSystemTz(async () => {
    const w = world();
    const base = { tz: "800000009", firstname: "N", lastname: "Ew" };
    for (const bad of ["not-an-id", "d".repeat(24), SYS._id, { $ne: null }]) {
      const res = await call(w.student.postS, reqAs(ADMIN, { body: { ...base, main_teacher: bad } }));
      assert.equal(res.statusCode, 400, JSON.stringify(bad));
      const put = await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[4].tz }, body: { main_teacher: bad } }));
      assert.equal(put.statusCode, 400, `put ${JSON.stringify(bad)}`);
    }
    assert.equal(w.students.all().length, 5);
    assert.equal(w.students.all()[4].main_teacher, undefined);

    const ok = await call(w.student.postS, reqAs(ADMIN, { body: { ...base, main_teacher: GUIDE._id } }));
    assert.equal(ok.statusCode, 201);
    assert.equal(w.students.all().at(-1).main_teacher, GUIDE._id);

    const none = await call(w.student.postS, reqAs(ADMIN, { body: { ...base, tz: "800000010" } }));
    assert.equal(none.statusCode, 201, "no instructor is fine");
    assert.equal(w.students.all().at(-1).main_teacher, null);

    const put = await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[4].tz }, body: { main_teacher: OTHER._id } }));
    assert.equal(put.statusCode, 200);
    assert.equal(w.students.all()[4].main_teacher, OTHER._id);

    // The guide now sees the student he was made responsible for.
    await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[4].tz }, body: { main_teacher: GUIDE._id } }));
    const list = await call(w.student.getAllS, reqAs(GUIDE));
    assert.ok(list.body.students.some((s) => s._id === sid(5)));
  });
});

test("lookup by exact tz returns only { tz, firstname, lastname, _id }; partial or unknown tz is 404", async () => {
  const w = world();
  const hit = await call(w.student.lookupS, reqAs(GUIDE, { params: { tz: S[2].tz } }));
  assert.equal(hit.statusCode, 200);
  assert.deepEqual(plain(hit.body.student), { tz: S[2].tz, firstname: "F3", lastname: "L3", _id: sid(3) });
  assert.ok(!JSON.stringify(hit.body).includes("0500000000"));

  for (const tz of [S[2].tz.slice(0, 5), S[2].tz.slice(1), `${S[2].tz}0`, "", "  ", ".*", "8000.*"]) {
    const res = await call(w.student.lookupS, reqAs(GUIDE, { params: { tz } }));
    assert.equal(res.statusCode, 404, `tz ${JSON.stringify(tz)}`);
    assert.equal(res.body.student, undefined);
  }
});

test("the lookup route is guarded by lessons.roster, then rate limited, and declared before /:tz", () => {
  const source = fs.readFileSync(path.join(__dirname, "../Entities/Student/Student.route.js"), "utf8");
  const lookup = source.search(/router\.get\(\s*['"]\/lookup\/:tz['"]\s*,\s*requirePermission\(\s*['"]lessons\.roster['"]\s*\)\s*,\s*lookupRateLimit\s*,\s*lookupS\s*\)/);
  const one = source.search(/router\.get\(\s*['"]\/:tz['"]/);
  assert.ok(lookup >= 0, "lookup route with lessons.roster then lookupRateLimit");
  assert.ok(lookup < one, "declared before /:tz");
  assert.match(source, /require\(\s*['"]\.\.\/\.\.\/middleware\/rateLimit['"]\s*\)/);
  assert.match(source, /const\s+lookupRateLimit\s*=\s*rateLimit\(\{\s*windowMs:\s*15\s*\*\s*60\s*\*\s*1000\s*,\s*max:\s*60\s*,/);
});

/* ================= lessons ================= */

test("a guide reading another guide's lesson sees no hidden ids, only hiddenCount; the true total stays", async () => {
  const w = world();
  const res = await call(w.lesson.getOne, reqAs(GUIDE, { params: { id: "lesson-2" } }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(plain(res.body.lesson.list_students), []);
  assert.equal(res.body.lesson.hiddenCount, 2);
  assert.equal(res.body.lesson.num_in_list, 2);

  const own = await call(w.lesson.getOne, reqAs(GUIDE, { params: { id: "lesson-1" } }));
  assert.deepEqual(plain(own.body.lesson.list_students), [sid(1)]);
  assert.equal(own.body.lesson.hiddenCount, 0);

  const admin = await call(w.lesson.getOne, reqAs(ADMIN, { params: { id: "lesson-2" } }));
  assert.deepEqual(plain(admin.body.lesson.list_students), [sid(3), sid(4)]);
  assert.equal(admin.body.lesson.hiddenCount, undefined, "admin answer unchanged");
  assert.equal(admin.body.lesson.num_in_list, 2);
});

test("lesson lists (all, query, today) never leak hidden student ids to a guide", async () => {
  const w = world();
  // Put both lessons on today's weekday so /today returns them.
  const js = new Date().getDay();
  const today = js === 0 ? 1 : js + 1;
  for (const l of w.lessons.all()) l.date.day = today;

  for (const [name, extra] of [["getAll", {}], ["getLessonsByQuery", { query: { day: String(today) } }], ["getLessonsByToDay", {}]]) {
    const res = await call(w.lesson[name], reqAs(GUIDE, extra));
    assert.equal(res.statusCode, 200, name);
    const body = JSON.stringify(res.body);
    for (const hidden of [sid(3), sid(4)]) assert.ok(!body.includes(hidden), `${name} leaks ${hidden}`);
    const theirs = res.body.lessons.find((l) => l._id === "lesson-2");
    assert.equal(theirs.num_in_list, 2, `${name} keeps the true total`);
    assert.equal(theirs.hiddenCount, 2, name);

    const admin = await call(w.lesson[name], reqAs(ADMIN, extra));
    assert.deepEqual(plain(admin.body.lessons.find((l) => l._id === "lesson-2").list_students), [sid(3), sid(4)], `${name} admin`);
  }
});

test("a guide saving a lesson with his filtered roster keeps the hidden ids; the audit records the true roster", async () => {
  const w = world();
  const res = await call(w.lesson.putOne, reqAs(GUIDE, { params: { id: "lesson-2" }, body: { name: "Renamed", list_students: [sid(1)] } }));
  assert.equal(res.statusCode, 200);
  const stored = w.lessons.all().find((l) => l._id === "lesson-2");
  assert.deepEqual(plain(stored.list_students), [sid(1), sid(3), sid(4)]);
  assert.equal(stored.name, "Renamed");
  for (const hidden of [sid(3), sid(4)]) assert.ok(!JSON.stringify(res.body).includes(hidden), `response leaks ${hidden}`);
  const [row] = w.audit.find({ module: "lessons", action: "update", targetId: "lesson-2" });
  assert.deepEqual(row.before.list_students, [sid(3), sid(4)]);
  assert.deepEqual(row.after.list_students, [sid(1), sid(3), sid(4)]);

  // An empty submitted roster removes only what the guide can see.
  await call(w.lesson.putOne, reqAs(GUIDE, { params: { id: "lesson-2" }, body: { list_students: [] } }));
  assert.deepEqual(plain(w.lessons.all().find((l) => l._id === "lesson-2").list_students), [sid(3), sid(4)]);

  // No list_students in the body: roster untouched.
  await call(w.lesson.putOne, reqAs(GUIDE, { params: { id: "lesson-2" }, body: { name: "Again" } }));
  assert.deepEqual(plain(w.lessons.all().find((l) => l._id === "lesson-2").list_students), [sid(3), sid(4)]);

  // An admin replaces the roster as today.
  await call(w.lesson.putOne, reqAs(ADMIN, { params: { id: "lesson-2" }, body: { list_students: [sid(5)] } }));
  assert.deepEqual(plain(w.lessons.all().find((l) => l._id === "lesson-2").list_students), [sid(5)]);
});

test("removeFromList with a hidden id leaves the roster unchanged; a visible id is removed", async () => {
  const w = world();
  const res = await call(w.lesson.removeFromList, reqAs(GUIDE, { params: { id: "lesson-2" }, body: { list_students: [sid(3)] } }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(plain(w.lessons.all().find((l) => l._id === "lesson-2").list_students), [sid(3), sid(4)]);

  await call(w.lesson.removeFromList, reqAs(GUIDE, { params: { id: "lesson-1" }, body: { list_students: [sid(1)] } }));
  assert.deepEqual(plain(w.lessons.all().find((l) => l._id === "lesson-1").list_students), []);

  await call(w.lesson.removeFromList, reqAs(ADMIN, { params: { id: "lesson-2" }, body: { list_students: [sid(3)] } }));
  assert.deepEqual(plain(w.lessons.all().find((l) => l._id === "lesson-2").list_students), [sid(4)]);
});

test("a scoped addToList takes _ids only if visible; existing but hidden _ids and unknown ids are dropped", async () => {
  const w = world();
  // s5 exists but is hidden: a guessed _id must not pull him in.
  const res = await call(w.lesson.addToList, reqAs(GUIDE, {
    params: { id: "lesson-1" },
    body: { list_students: [sid(2), sid(5), "d".repeat(24), "not-an-id", sid(1)] },
  }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(plain(w.lessons.all().find((l) => l._id === "lesson-1").list_students), [sid(1), sid(2)]);

  // An admin adds as today (no existence check).
  await call(w.lesson.addToList, reqAs(ADMIN, { params: { id: "lesson-2" }, body: { list_students: ["anything"] } }));
  assert.deepEqual(plain(w.lessons.all().find((l) => l._id === "lesson-2").list_students), [sid(3), sid(4), "anything"]);
});

/* ================= attendance ================= */

test("a guide's attendance sheet lists only visible students", async () => {
  const w = world();
  // Add s1 (visible through lesson-1) to lesson-2 so the sheet mixes both.
  w.lessons.all().find((l) => l._id === "lesson-2").list_students.push(sid(1));
  const q = { lessonId: "lesson-2", year: 2026, month: 10, day: 17 };
  const res = await call(w.att.getSheet, reqAs(GUIDE, { query: q }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(plain(res.body.schema.items.map((i) => i.studentId)), [sid(1)]);
  assert.deepEqual(w.attendance.all().map((r) => r.student), [sid(1)], "no rows created for hidden students");
  assert.ok(!JSON.stringify(res.body).includes(S[2].tz));

  const admin = await call(w.att.getSheet, reqAs(ADMIN, { query: q }));
  assert.deepEqual(plain(admin.body.schema.items.map((i) => i.studentId)), [sid(3), sid(4), sid(1)]);
});

test("attendance save ignores rows for hidden students", async () => {
  const w = world();
  const body = {
    lessonId: "lesson-1", year: 2026, month: 10, day: 17,
    items: [{ studentId: sid(1), status: "غائب" }, { studentId: sid(3), status: "غائب" }],
  };
  const res = await call(w.att.bulkSave, reqAs(GUIDE, { body }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(w.attendance.all().map((r) => r.student), [sid(1)]);
  assert.equal(w.audit.calls[0].after.rowsSaved, 1);

  const admin = await call(w.att.bulkSave, reqAs(ADMIN, { body: { ...body, day: 18 } }));
  assert.equal(admin.statusCode, 200);
  assert.equal(w.attendance.all().filter((r) => r.day === 18).length, 2, "admin writes every row");
});

/* ================= fix round 1 ================= */
const PENDING = "ينتظر"; // waiting-list status (InviteToken.controller PENDING_STATUS)
const lessonById = (w, id) => w.lessons.all().find((l) => l._id === id);

test("a scoped actor cannot make himself teacher or helper of a lesson he is not on (403, unchanged)", async () => {
  const w = world();
  for (const field of ["teacher", "helper"]) {
    const res = await call(w.lesson.putOne, reqAs(GUIDE, { params: { id: "lesson-2" }, body: { [field]: GUIDE._id } }));
    assert.equal(res.statusCode, 403, field);
    assert.equal(res.body.code, "FORBIDDEN");
  }
  // Changing someone else's staff on a lesson he is not on is refused too.
  const swap = await call(w.lesson.putOne, reqAs(GUIDE, { params: { id: "lesson-2" }, body: { teacher: ADMIN._id } }));
  assert.equal(swap.statusCode, 403);
  const stored = lessonById(w, "lesson-2");
  assert.equal(stored.teacher, OTHER._id);
  assert.equal(stored.helper, null);
  assert.equal(w.audit.calls.length, 0);

  // s3/s4 stay invisible.
  const list = await call(w.student.getAllS, reqAs(GUIDE));
  assert.deepEqual(list.body.students.map((s) => s._id).sort(), [sid(1), sid(2)]);
  const one = await call(w.lesson.getOne, reqAs(GUIDE, { params: { id: "lesson-2" } }));
  assert.deepEqual(plain(one.body.lesson.list_students), []);

  // Same teacher value is not a change; editing other fields still works.
  const same = await call(w.lesson.putOne, reqAs(GUIDE, { params: { id: "lesson-2" }, body: { teacher: OTHER._id, name: "N" } }));
  assert.equal(same.statusCode, 200);

  // On his own lesson he may change the helper; an admin may change anything.
  const own = await call(w.lesson.putOne, reqAs(GUIDE, { params: { id: "lesson-1" }, body: { helper: ADMIN._id } }));
  assert.equal(own.statusCode, 200);
  assert.equal(lessonById(w, "lesson-1").helper, ADMIN._id);
  const admin = await call(w.lesson.putOne, reqAs(ADMIN, { params: { id: "lesson-2" }, body: { teacher: GUIDE._id, room: "7", date: { day: 6, startMin: 600, endMin: 645 } } }));
  assert.equal(admin.statusCode, 200);
  assert.equal(lessonById(w, "lesson-2").teacher, GUIDE._id);
});

test("a scoped putOne with a non-array list_students keeps the stored roster", async () => {
  for (const bad of [null, "x", {}]) {
    const w = world();
    for (const id of ["lesson-1", "lesson-2"]) {
      const before = plain(lessonById(w, id).list_students);
      const res = await call(w.lesson.putOne, reqAs(GUIDE, { params: { id }, body: { name: "N", list_students: bad } }));
      assert.equal(res.statusCode, 200, `${id} ${JSON.stringify(bad)}`);
      assert.deepEqual(plain(lessonById(w, id).list_students), before, `${id} ${JSON.stringify(bad)}`);
    }
  }
});

test("main_teacher is set only by a students.viewAll holder; otherwise it is ignored", async () => {
  const w = world();
  // A scoped creator becomes the new student's responsible guide, whatever he sends.
  const created = await call(w.student.postS, reqAs(GUIDE, { body: { tz: "800000011", firstname: "G", lastname: "C", main_teacher: OTHER._id } }));
  assert.equal(created.statusCode, 201);
  assert.equal(w.students.all().at(-1).main_teacher, GUIDE._id);

  const ignoredBad = await call(w.student.postS, reqAs(GUIDE, { body: { tz: "800000012", firstname: "G", lastname: "D", main_teacher: "not-an-id" } }));
  assert.equal(ignoredBad.statusCode, 201, "ignored, not validated");
  assert.equal(w.students.all().at(-1).main_teacher, GUIDE._id);

  for (const value of [OTHER._id, "not-an-id"]) {
    const put = await call(w.student.putS, reqAs(GUIDE, { params: { tz: S[1].tz }, body: { firstname: "Up", main_teacher: value } }));
    assert.equal(put.statusCode, 200);
    assert.equal(w.students.all()[1].main_teacher, GUIDE._id, "unchanged");
    assert.equal(w.students.all()[1].firstname, "Up");
  }
  const [row] = w.audit.find({ module: "students", action: "update", targetId: sid(2) });
  assert.equal(row.after.main_teacher, GUIDE._id);
});

test("a scoped postOne must name himself and keeps only existing, non-pending students", async () => {
  const w = world();
  w.students.all()[3].status = PENDING; // s4 is on the waiting list
  const lesson = { name: "New", room: "9", date: { day: 3, startMin: 600, endMin: 645 } };
  const res = await call(w.lesson.postOne, reqAs(GUIDE, { body: {
    ...lesson, teacher: GUIDE._id,
    // _ids: only visible ones count (s1); hidden s5/s4 and unknown ids are dropped.
    list_students: [sid(1), sid(5), sid(4), "d".repeat(24), "not-an-id", sid(5)],
    // tz: exact, non-waiting matches are resolved (s5); waiting s4, partial and unknown are dropped.
    list_tz: [S[4].tz, S[3].tz, S[4].tz.slice(0, 5), "899999999", S[4].tz, S[0].tz],
  } }));
  assert.equal(res.statusCode, 201);
  assert.deepEqual(plain(w.lessons.all().at(-1).list_students), [sid(1), sid(5)]);
  assert.equal(w.lessons.all().at(-1).list_tz, undefined, "list_tz is not stored");

  const asHelper = await call(w.lesson.postOne, reqAs(GUIDE, { body: { ...lesson, date: { day: 4, startMin: 600, endMin: 645 }, teacher: OTHER._id, helper: GUIDE._id } }));
  assert.equal(asHelper.statusCode, 201);

  const count = w.lessons.all().length;
  const forOther = await call(w.lesson.postOne, reqAs(GUIDE, { body: { ...lesson, date: { day: 5, startMin: 600, endMin: 645 }, teacher: OTHER._id } }));
  assert.equal(forOther.statusCode, 403);
  assert.equal(w.lessons.all().length, count);

  const admin = await call(w.lesson.postOne, reqAs(ADMIN, { body: { ...lesson, date: { day: 6, startMin: 600, endMin: 645 }, teacher: OTHER._id, list_students: ["anything"] } }));
  assert.equal(admin.statusCode, 201);
  assert.deepEqual(plain(w.lessons.all().at(-1).list_students), ["anything"], "admin as today");
});

test("a scoped attendance save writes only rows for students in that lesson", async () => {
  const w = world();
  const body = {
    lessonId: "lesson-1", year: 2026, month: 10, day: 17,
    items: [{ studentId: sid(1), status: "غائب" }, { studentId: sid(2), status: "غائب" }], // s2 visible, not in lesson-1
  };
  const res = await call(w.att.bulkSave, reqAs(GUIDE, { body }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(w.attendance.all().map((r) => r.student), [sid(1)]);
});

test("pending (waiting-list) students are not found by lookup nor added by addToList for a scoped actor", async () => {
  const w = world();
  w.students.all()[4].status = PENDING;
  const look = await call(w.student.lookupS, reqAs(GUIDE, { params: { tz: S[4].tz } }));
  assert.equal(look.statusCode, 404);
  const adminLook = await call(w.student.lookupS, reqAs(ADMIN, { params: { tz: S[4].tz } }));
  assert.equal(adminLook.statusCode, 200);

  await call(w.lesson.addToList, reqAs(GUIDE, { params: { id: "lesson-1" }, body: { list_tz: [S[4].tz, S[2].tz] } }));
  assert.deepEqual(plain(lessonById(w, "lesson-1").list_students), [sid(1), sid(3)]);

  await call(w.lesson.addToList, reqAs(ADMIN, { params: { id: "lesson-1" }, body: { list_students: [sid(5)] } }));
  assert.deepEqual(plain(lessonById(w, "lesson-1").list_students), [sid(1), sid(3), sid(5)], "admin as today");
});

/* ================= fix round 2 ================= */

test("a scoped guide adds an out-of-scope student only by exact tz (list_tz), never by a guessed _id", async () => {
  const w = world();
  // Existing but invisible _id: not added.
  await call(w.lesson.addToList, reqAs(GUIDE, { params: { id: "lesson-1" }, body: { list_students: [sid(5)] } }));
  assert.deepEqual(plain(lessonById(w, "lesson-1").list_students), [sid(1)]);
  assert.ok(!(await call(w.student.getAllS, reqAs(GUIDE))).body.students.some((s) => s._id === sid(5)));

  // The same student by his tz: added.
  const byTz = await call(w.lesson.addToList, reqAs(GUIDE, { params: { id: "lesson-1" }, body: { list_tz: [` ${S[4].tz} `] } }));
  assert.equal(byTz.statusCode, 200);
  assert.deepEqual(plain(lessonById(w, "lesson-1").list_students), [sid(1), sid(5)]);

  // A waiting student's tz, a partial tz, an unknown tz, a non-string: not added.
  w.students.all()[3].status = PENDING;
  await call(w.lesson.addToList, reqAs(GUIDE, { params: { id: "lesson-1" }, body: {
    list_tz: [S[3].tz, S[2].tz.slice(0, 6), "899999999", { $ne: null }, ".*"],
  } }));
  assert.deepEqual(plain(lessonById(w, "lesson-1").list_students), [sid(1), sid(5)]);

  // Mixed body: visible _id plus tz, no duplicates.
  await call(w.lesson.addToList, reqAs(GUIDE, { params: { id: "lesson-1" }, body: { list_students: [sid(2), sid(5)], list_tz: [S[1].tz, S[2].tz] } }));
  assert.deepEqual(plain(lessonById(w, "lesson-1").list_students), [sid(1), sid(5), sid(2), sid(3)]);
});

test("an admin still adds by _id (unchanged) and may also use list_tz", async () => {
  const w = world();
  await call(w.lesson.addToList, reqAs(ADMIN, { params: { id: "lesson-1" }, body: { list_students: [sid(5), "anything"] } }));
  assert.deepEqual(plain(lessonById(w, "lesson-1").list_students), [sid(1), sid(5), "anything"]);
  await call(w.lesson.addToList, reqAs(ADMIN, { params: { id: "lesson-1" }, body: { list_tz: [S[2].tz, S[4].tz] } }));
  assert.deepEqual(plain(lessonById(w, "lesson-1").list_students), [sid(1), sid(5), "anything", sid(3)]);
});

test("putS refuses a tz change that collides with another student (409 TZ_EXISTS)", async () => {
  const w = world();
  const clash = await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[0].tz }, body: { tz: S[1].tz, firstname: "X" } }));
  assert.equal(clash.statusCode, 409);
  assert.equal(clash.body.code, "TZ_EXISTS");
  assert.equal(w.students.all()[0].tz, S[0].tz);
  assert.equal(w.students.all()[0].firstname, "F1");
  assert.equal(w.audit.calls.length, 0);

  const same = await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[0].tz }, body: { tz: S[0].tz, firstname: "Y" } }));
  assert.equal(same.statusCode, 200, "own tz is not a collision");
  const moved = await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[0].tz }, body: { tz: "800000099" } }));
  assert.equal(moved.statusCode, 200);
  assert.equal(w.students.all()[0].tz, "800000099");
});

test("deleteS removes only the record it found, by _id", async () => {
  const w = world();
  // A legacy duplicate sharing s1's tz must survive the delete.
  await w.students.create({ _id: sid(9), tz: S[0].tz, firstname: "Dup", lastname: "Licate" });
  const res = await call(w.student.deleteS, reqAs(ADMIN, { params: { tz: S[0].tz } }));
  assert.equal(res.statusCode, 200);
  const left = w.students.all().filter((s) => s.tz === S[0].tz);
  assert.equal(left.length, 1);
  assert.equal(left[0]._id, sid(9));
});

test("an explicit empty main_teacher from a viewAll holder clears it; a missing one leaves it", async () => {
  await withSystemTz(async () => {
    const w = world();
    for (const empty of ["", null]) {
      await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[1].tz }, body: { main_teacher: GUIDE._id } }));
      assert.equal(w.students.all()[1].main_teacher, GUIDE._id);
      const put = await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[1].tz }, body: { main_teacher: empty } }));
      assert.equal(put.statusCode, 200);
      assert.equal(w.students.all()[1].main_teacher, null, `cleared by ${JSON.stringify(empty)}`);
    }
    await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[1].tz }, body: { main_teacher: GUIDE._id } }));
    await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[1].tz }, body: { firstname: "Same" } }));
    assert.equal(w.students.all()[1].main_teacher, GUIDE._id, "untouched when not sent");

    // A guide sending an empty value cannot clear it.
    await call(w.student.putS, reqAs(GUIDE, { params: { tz: S[1].tz }, body: { main_teacher: "" } }));
    assert.equal(w.students.all()[1].main_teacher, GUIDE._id);
  });
});

test("list_tz is capped at 50 entries on addToList and postOne", async () => {
  const w = world();
  const fifty = Array.from({ length: 50 }, (_, i) => `7000000${String(i).padStart(2, "0")}`);
  const tooMany = [...fifty, "700000099"];

  const add = await call(w.lesson.addToList, reqAs(GUIDE, { params: { id: "lesson-1" }, body: { list_tz: tooMany } }));
  assert.equal(add.statusCode, 400);
  assert.equal(add.body.code, "TOO_MANY");
  const okAdd = await call(w.lesson.addToList, reqAs(GUIDE, { params: { id: "lesson-1" }, body: { list_tz: fifty } }));
  assert.equal(okAdd.statusCode, 200);

  const before = w.lessons.all().length;
  const lesson = { name: "Cap", room: "1", date: { day: 3, startMin: 600, endMin: 645 }, teacher: GUIDE._id };
  const post = await call(w.lesson.postOne, reqAs(GUIDE, { body: { ...lesson, list_tz: tooMany } }));
  assert.equal(post.statusCode, 400);
  assert.equal(post.body.code, "TOO_MANY");
  assert.equal(w.lessons.all().length, before, "nothing created");
});

/* ================= final-review fix wave ================= */

test("an unchanged stale main_teacher (inactive or legacy) does not block saving other fields", async () => {
  await withSystemTz(async () => {
    const w = world();
    // s1: a guide who is no longer active (not in the active users); s3: a legacy non-hex value.
    w.students.all()[0].main_teacher = "d".repeat(24);
    w.students.all()[2].main_teacher = "legacy-guide";
    for (const [i, stale] of [[0, "d".repeat(24)], [2, "legacy-guide"]]) {
      const put = await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[i].tz }, body: { phone: "0500000001", main_teacher: stale } }));
      assert.equal(put.statusCode, 200, stale);
      assert.equal(w.students.all()[i].phone, "0500000001");
      assert.equal(w.students.all()[i].main_teacher, stale, "value kept");
    }
    // Changing it to another invalid value is still refused.
    const bad = await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[0].tz }, body: { main_teacher: "e".repeat(23) + "f" } }));
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.body.code, "INVALID_INSTRUCTOR");
    assert.equal(w.students.all()[0].main_teacher, "d".repeat(24));
  });
});

test("attendance save with nothing to write records no audit row", async () => {
  const w = world();
  const base = { year: 2026, month: 10, day: 17 };
  // Scoped: hidden roster only, and an unknown lesson.
  for (const lessonId of ["lesson-2", "lesson-404"]) {
    const res = await call(w.att.bulkSave, reqAs(GUIDE, { body: { ...base, lessonId, items: [{ studentId: sid(3), status: "غائب" }] } }));
    assert.equal(res.statusCode, 200, lessonId);
  }
  // Admin with an empty list.
  const empty = await call(w.att.bulkSave, reqAs(ADMIN, { body: { ...base, lessonId: "lesson-1", items: [] } }));
  assert.equal(empty.statusCode, 200);
  assert.equal(w.attendance.all().length, 0);
  assert.equal(w.audit.calls.length, 0);

  const saved = await call(w.att.bulkSave, reqAs(GUIDE, { body: { ...base, lessonId: "lesson-1", items: [{ studentId: sid(1), status: "غائب" }] } }));
  assert.equal(saved.statusCode, 200);
  assert.equal(w.audit.calls.length, 1);
  assert.equal(w.audit.calls[0].after.rowsSaved, 1);
});

test("a student update stamps updatedAt, announces the change, and refuses a stale baseVersion with 409", async () => {
  const w = world();
  live.changes.length = 0;
  const stale = await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[0].tz }, body: { firstname: "A", baseVersion: "2000-01-01T00:00:00.000Z" } }));
  // Nothing is stored with an updatedAt yet, so there is nothing to be stale against.
  assert.equal(stale.statusCode, 200);
  assert.deepEqual(live.changes, [["student", S[0]._id]]);
  const saved = w.students.all().find((s) => s._id === S[0]._id);
  assert.ok(Number.isFinite(Date.parse(saved.updatedAt)));

  live.changes.length = 0;
  const behind = await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[0].tz }, body: { firstname: "B", baseVersion: "2000-01-01T00:00:00.000Z" } }));
  assert.equal(behind.statusCode, 409);
  assert.equal(behind.body.code, "STALE");
  assert.equal(behind.body.current.firstname, "A");
  assert.deepEqual(live.changes, [], "a refused save announces nothing");
  assert.equal(w.students.all().find((s) => s._id === S[0]._id).firstname, "A");

  const fresh = await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[0].tz }, body: { firstname: "C", baseVersion: new Date(saved.updatedAt).toISOString() } }));
  assert.equal(fresh.statusCode, 200);
});

test("a staff student update tells that student's own sport screen (name or photo may have changed)", async () => {
  const w = world();
  live.students.length = 0;
  const saved = await call(w.student.putS, reqAs(ADMIN, { params: { tz: S[0].tz }, body: { firstname: "Renamed" } }));
  assert.equal(saved.statusCode, 200);
  assert.deepEqual(live.students, [[[S[0]._id], "me"]]);
});
