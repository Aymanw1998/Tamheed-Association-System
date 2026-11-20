const assert = require("node:assert/strict");
const test = require("node:test");
const { conversionRules } = require("../utils/conversionAttendance");
const { rosterable, takeBackConverting } = require("../utils/rosterGuard");
const { sameVersion, nextStamp } = require("../middleware/lockGuard");

// Attendance around the cutover, and rosters during a conversion (owner,
// 2026-11-19). Synthetic ids only.
const id = (c) => c.repeat(24);
const S = id("5");
const U = id("d");
const PLANNED = id("1");
const OTHER = id("2");
const conv = { phase: "done", userId: U, cutoverDateKey: 20261120, plannedLessons: [PLANNED] };
const hit = (value, cond) => (cond && typeof cond === "object" && Array.isArray(cond.$in) ? cond.$in.map(String).includes(String(value)) : String(value) === String(cond));
const store = (rows) => ({ async get(f) { return { success: true, result: rows.filter((r) => Object.entries(f).every(([k, v]) => hit(r[k], v))) }; } });
const students = store([{ _id: S, firstname: "علي", staffConversion: conv, archivedAt: new Date() }]);
const users = store([{ _id: U, firstname: "علي", fromStudentId: S }]);

test("before the cutover, in a moved program: his student row, never the staff row", async () => {
  const r = await conversionRules({ lessonId: PLANNED, dateKey: 20261118, rosterStudents: [], userIds: [U], students, users });
  assert.deepEqual([...r.skipUsers], [U]);
  assert.deepEqual(r.addStudents.map((s) => s._id), [S]);
});

test("from the cutover: the staff row only", async () => {
  const r = await conversionRules({ lessonId: PLANNED, dateKey: 20261120, rosterStudents: [], userIds: [U], students, users });
  assert.equal(r.skipUsers.size, 0);
  assert.equal(r.addStudents.length, 0);
});

test("a program he joined only as staff never gets a student row, and no staff row before the cutover", async () => {
  const r = await conversionRules({ lessonId: OTHER, dateKey: 20261110, rosterStudents: [], userIds: [U], students, users });
  assert.deepEqual([...r.skipUsers], [U]);
  assert.equal(r.addStudents.length, 0);
});

test("while the rosters are not moved yet, a student row on or after the cutover is skipped", async () => {
  const pending = { _id: S, staffConversion: { ...conv, phase: "prepared" } };
  const after = await conversionRules({ lessonId: PLANNED, dateKey: 20261121, rosterStudents: [pending], userIds: [], students, users });
  assert.deepEqual([...after.skipStudents], [S]);
  const before = await conversionRules({ lessonId: PLANNED, dateKey: 20261119, rosterStudents: [pending], userIds: [], students, users });
  assert.equal(before.skipStudents.size, 0, "the conversion day stays a student day");
});

test("a student with a conversion or archived joins no roster", () => {
  assert.equal(rosterable({ _id: S }), true);
  assert.equal(rosterable({ _id: S, staffConversion: { phase: "preparing" } }), false);
  assert.equal(rosterable({ _id: S, archivedAt: new Date() }), false);
});

test("an add that raced the conversion is taken back", async () => {
  const lessonRows = [{ _id: PLANNED, list_students: [id("6"), S], updatedAt: new Date("2026-11-01") }];
  const lessons = {
    ...store(lessonRows),
    async updateExisting(filter, patch) {
      const row = lessonRows.find((l) => l._id === filter._id && String(l.updatedAt) === String(filter.updatedAt));
      if (!row) return { result: null };
      Object.assign(row, patch);
      return { result: row };
    },
  };
  const back = await takeBackConverting({ lessons, students, lessonId: PLANNED, addedIds: [S, id("6")], sameVersion, nextStamp });
  assert.deepEqual(back, [S]);
  assert.deepEqual(lessonRows[0].list_students, [id("6")]);
});

test("an educational program that raced the conversion takes the student back", async () => {
  const { createEducationalLessons } = require("../services/educationalLesson");
  const lessonRows = [{ _id: PLANNED, kind: "educational", teacher: id("b"), list_students: [], updatedAt: new Date("2026-11-01") }];
  const lessons = {
    async get(f) { return { success: true, result: lessonRows.filter((l) => Object.entries(f).every(([k, v]) => String(l[k]) === String(v))).map((l) => ({ ...l })) }; },
    async updateExisting(filter, patch) {
      const row = lessonRows.find((l) => l._id === filter._id && String(l.updatedAt ?? null) === String(filter.updatedAt ?? null));
      if (!row) return { result: null };
      Object.assign(row, patch);
      return { result: { ...row } };
    },
  };
  // The guide's own list still shows him as a plain student; read by id, his conversion has started.
  const students = {
    async get(f) {
      if (f.main_teacher) return { success: true, result: [{ _id: S, main_teacher: id("b") }] };
      return { success: true, result: [{ _id: S, staffConversion: { phase: "preparing" } }] };
    },
  };
  await createEducationalLessons({ lessons, students }).enrolAll(id("b"), PLANNED);
  assert.deepEqual(lessonRows[0].list_students, []);
});

// Codex build review 2: a retry against a newer roster can put back a student
// the conversion has just taken off, although the first snapshot held him.
test("an educational retry that puts a converting student back takes him off again", async () => {
  const { createEducationalLessons } = require("../services/educationalLesson");
  const T = id("7");
  const lessonRows = [{ _id: PLANNED, kind: "educational", teacher: id("b"), list_students: [S], updatedAt: new Date("2026-11-01") }];
  let converted = false;
  const lessons = {
    async get(f) { return { success: true, result: lessonRows.filter((l) => Object.entries(f).every(([k, v]) => String(l[k]) === String(v))).map((l) => ({ ...l, list_students: [...l.list_students] })) }; },
    async updateExisting(filter, patch) {
      if (!converted) {
        // The conversion moves him out just before this write lands.
        converted = true;
        Object.assign(lessonRows[0], { list_students: [], updatedAt: new Date("2026-11-02") });
      }
      const row = lessonRows.find((l) => l._id === filter._id && String(l.updatedAt ?? null) === String(filter.updatedAt ?? null));
      if (!row) return { result: null };
      Object.assign(row, patch);
      return { result: { ...row } };
    },
  };
  const students = {
    async get(f) {
      if (f.main_teacher) return { success: true, result: [{ _id: S, main_teacher: id("b") }, { _id: T, main_teacher: id("b") }] };
      return { success: true, result: [String(f._id) === S ? { _id: S, staffConversion: { phase: "account" } } : { _id: T }] };
    },
  };
  await createEducationalLessons({ lessons, students }).enrolAll(id("b"), PLANNED);
  assert.deepEqual(lessonRows[0].list_students, [T]);
});

test("enrolment never takes off a member who was already on the roster", async () => {
  const { createEducationalLessons } = require("../services/educationalLesson");
  const T = id("7");
  const lessonRows = [{ _id: PLANNED, kind: "educational", teacher: id("b"), list_students: [S], updatedAt: new Date("2026-11-01") }];
  const lessons = {
    async get(f) { return { success: true, result: lessonRows.filter((l) => Object.entries(f).every(([k, v]) => String(l[k]) === String(v))).map((l) => ({ ...l, list_students: [...l.list_students] })) }; },
    async updateExisting(filter, patch) {
      const row = lessonRows.find((l) => l._id === filter._id && String(l.updatedAt ?? null) === String(filter.updatedAt ?? null));
      if (!row) return { result: null };
      Object.assign(row, patch);
      return { result: { ...row } };
    },
  };
  // His conversion's barrier lands after the guide's list was read: the scan
  // that follows must still find him here.
  const students = {
    async get(f) {
      if (f.main_teacher) return { success: true, result: [{ _id: S, main_teacher: id("b") }, { _id: T, main_teacher: id("b") }] };
      return { success: true, result: [String(f._id) === S ? { _id: S, staffConversion: { phase: "preparing" } } : { _id: T }] };
    },
  };
  await createEducationalLessons({ lessons, students }).enrolAll(id("b"), PLANNED);
  assert.deepEqual(lessonRows[0].list_students, [S, T]);
});

/* ---------- Codex build review 5 ---------- */

test("duplicate rows for one person, program and date: one stays, a person's mark is never dropped", async () => {
  const { dropDuplicateRows } = require("../utils/conversionAttendance");
  let rows = [
    { _id: "empty", lesson: PLANNED, user: U, dateKey: 20261125, status: "حاضر", updatedAt: new Date("2026-11-20T10:00:00Z") },
    { _id: "saved", lesson: PLANNED, user: U, dateKey: 20261125, status: "غائب", auto: false, updatedAt: new Date("2026-11-20T09:00:00Z") },
  ];
  const attendance = {
    async get(f) { return { success: true, result: rows.filter((r) => Object.entries(f).every(([k, v]) => String(r[k]) === String(v))) }; },
    async delete(f) { const before = rows.length; rows = rows.filter((r) => !(r._id === f._id && String(r.updatedAt) === String(f.updatedAt))); return { success: true, result: { deletedCount: before - rows.length } }; },
  };
  await dropDuplicateRows(attendance, { lesson: PLANNED, user: U, dateKey: 20261125 });
  assert.deepEqual(rows.map((r) => r._id), ["saved"]);
});

test("a guide change never takes off a membership the student already had", async () => {
  const { createEducationalLessons } = require("../services/educationalLesson");
  const lessonRows = [{ _id: PLANNED, kind: "educational", teacher: id("b"), list_students: [S], updatedAt: new Date("2026-11-01") }];
  const lessons = {
    async get(f) { return { success: true, result: lessonRows.filter((l) => Object.entries(f).every(([k, v]) => String(l[k]) === String(v))).map((l) => ({ ...l, list_students: [...l.list_students] })) }; },
    async updateExisting(filter, patch) {
      const row = lessonRows.find((l) => l._id === filter._id && String(l.updatedAt ?? null) === String(filter.updatedAt ?? null));
      if (!row) return { result: null };
      Object.assign(row, patch);
      return { result: { ...row } };
    },
  };
  // Plain when moveStudent checks him, converting when a take-back would look.
  let reads = 0;
  const students = { async get() { reads += 1; return { success: true, result: [reads === 1 ? { _id: S } : { _id: S, staffConversion: { phase: "preparing" } }] }; } };
  await createEducationalLessons({ lessons, students }).moveStudent(S, null, id("b"));
  assert.deepEqual(lessonRows[0].list_students, [S], "left for the conversion's scan");
});

test("a guide change never puts a student in mid-conversion on, so nothing is written", async () => {
  const { createEducationalLessons } = require("../services/educationalLesson");
  const lessonRows = [{ _id: PLANNED, kind: "educational", teacher: id("b"), list_students: [], updatedAt: new Date("2026-11-01") }];
  let writes = 0;
  const lessons = {
    async get(f) { return { success: true, result: lessonRows.filter((l) => Object.entries(f).every(([k, v]) => String(l[k]) === String(v))).map((l) => ({ ...l })) }; },
    async updateExisting() { writes += 1; return { result: null }; },
  };
  const students = { async get() { return { success: true, result: [{ _id: S, staffConversion: { phase: "account" } }] }; } };
  await createEducationalLessons({ lessons, students }).moveStudent(S, null, id("b"));
  assert.equal(writes, 0);
});
