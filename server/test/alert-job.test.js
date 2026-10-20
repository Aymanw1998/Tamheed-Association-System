// The periodic alert check (every 15 minutes, 07:00-21:00 Jerusalem): lessons
// that ended today without attendance, three absences in a row, and a teacher
// with a lesson today but no report by 20:00. A JobRuns lock keeps two server
// processes from running the same slot.
const assert = require("node:assert/strict");
const test = require("node:test");

const { runAlertJob, jerusalemClock } = require("../services/alertJob");
const { createAlertEngine } = require("../services/alertEngine");

const SYSTEM_TZ = "SYS-JOB";
const ADMIN = "ادارة";
const GUIDE = "مرشد";
const HELPER = "مساعد";
const ABSENT = "غائب";
const PRESENT = "حاضر";

const SYS = { _id: "s".repeat(24), tz: SYSTEM_TZ };
const ADMIN_U = { _id: "a".repeat(24), tz: "t-admin", firstname: "Ad", lastname: "Min", role: ADMIN, roles: [ADMIN] };
const TEACHER = { _id: "g".repeat(24), tz: "t-guide", firstname: "Gu", lastname: "Ide", role: GUIDE, roles: [GUIDE] };
const OTHER_GUIDE = { _id: "f".repeat(24), tz: "t-guide-2", firstname: "Ot", lastname: "Her", role: GUIDE, roles: [GUIDE] };
const HELPER_U = { _id: "h".repeat(24), tz: "t-helper", firstname: "He", lastname: "Lper", role: HELPER, roles: [HELPER] };
const USERS = [SYS, ADMIN_U, TEACHER, OTHER_GUIDE, HELPER_U];

// 2026-10-20 is a Tuesday (day 3, Sunday = 1). Jerusalem is UTC+3 that day.
const at = (hhmm) => new Date(`2026-10-20T${hhmm}:00+03:00`);
const TODAY = 20261020;

const STUDENT = { _id: "1".repeat(24), tz: "stu-1", firstname: "Kid", lastname: "One", main_teacher: TEACHER._id };
const lesson = (extra = {}) => ({
  _id: "2".repeat(24), name: "Math", date: { day: 3, startMin: 600, endMin: 660 },
  teacher: TEACHER._id, helper: HELPER_U._id, list_students: [STUDENT._id], ...extra,
});

function alertStore() {
  const docs = [];
  return {
    docs,
    async insertOnce(doc) {
      if (docs.some((d) => d.recipientTz === doc.recipientTz && d.dedupKey === doc.dedupKey)) return { created: false };
      docs.push({ _id: String(docs.length + 1), ...doc });
      return { created: true };
    },
  };
}

function fakeDeps({ lessons = [lesson()], attendance = [], reports = [], users = USERS, store = alertStore(), locks = new Set() } = {}) {
  const engine = createAlertEngine({
    listActiveUsers: async () => users.map((u) => ({ ...u })),
    findStudentById: async (id) => (id === STUDENT._id ? { ...STUDENT } : null),
    lessonsWithStudent: async (id) => lessons.filter((l) => (l.list_students || []).includes(id)),
    store,
    systemTz: SYSTEM_TZ,
  });
  const deps = {
    store, locks, lockCalls: 0,
    engine,
    listActiveUsers: async () => users.map((u) => ({ ...u })),
    listLessons: async () => lessons.map((l) => ({ ...l })),
    attendanceForDay: async (dateKey) => attendance.filter((r) => r.dateKey === dateKey),
    recentAbsences: async (fromKey, toKey) => attendance.filter((r) => r.status === ABSENT && r.dateKey >= fromKey && r.dateKey <= toKey),
    // Like the real query: newest first, at most `limit` rows.
    attendanceOfStudent: async (studentId, toKey, limit) => attendance
      .filter((r) => r.student === studentId && r.dateKey <= toKey)
      .sort((a, b) => b.dateKey - a.dateKey)
      .slice(0, limit),
    findStudent: async (id) => (id === STUDENT._id ? { ...STUDENT } : null),
    reportsBetween: async (from, to) => reports.filter((r) => new Date(r.date) >= from && new Date(r.date) < to),
    async acquireLock(key) {
      deps.lockCalls += 1;
      if (locks.has(key)) return false;
      locks.add(key);
      return true;
    },
    log() {},
  };
  return deps;
}

const recipientsOf = (store, type) => store.docs.filter((d) => d.type === type).map((d) => d.recipientTz).sort();
const row = (dateKey, status, extra = {}) => ({ lesson: "2".repeat(24), student: STUDENT._id, dateKey, status, ...extra });

test("the Jerusalem clock gives date, weekday (Sunday = 1), minutes and the 15-minute slot", () => {
  const c = jerusalemClock(at("14:07"));
  assert.equal(c.date, "2026-10-20");
  assert.equal(c.dateKey, TODAY);
  assert.equal(c.dow, 3);
  assert.equal(c.minutes, 14 * 60 + 7);
  assert.equal(c.slot, "2026-10-20T14:00");
});

test("outside 07:00-21:00 Jerusalem the job does nothing, not even take the lock", async () => {
  for (const time of ["06:59", "21:01", "23:30", "02:00"]) {
    const deps = fakeDeps();
    const result = await runAlertJob({ now: at(time), deps });
    assert.equal(result.skipped, "outside_hours", time);
    assert.equal(deps.lockCalls, 0);
    assert.equal(deps.store.docs.length, 0);
  }
});

test("the JobRuns lock stops a second run of the same slot", async () => {
  const locks = new Set();
  const store = alertStore();
  const first = await runAlertJob({ now: at("14:00"), deps: fakeDeps({ locks, store }) });
  assert.equal(first.skipped, undefined);
  const second = await runAlertJob({ now: at("14:05"), deps: fakeDeps({ locks, store }) });
  assert.equal(second.skipped, "locked");
  const next = await runAlertJob({ now: at("14:15"), deps: fakeDeps({ locks, store }) });
  assert.equal(next.skipped, undefined, "the next slot runs");
});

test("lesson_no_attendance: an ended lesson without rows alerts its teacher, helper and lessons.viewAll holders", async () => {
  const deps = fakeDeps();
  await runAlertJob({ now: at("14:00"), deps });
  assert.deepEqual(recipientsOf(deps.store, "lesson_no_attendance"), [ADMIN_U.tz, TEACHER.tz, HELPER_U.tz].sort());
  const doc = deps.store.docs.find((d) => d.type === "lesson_no_attendance");
  assert.equal(doc.link, `/lessons/${"2".repeat(24)}`);
  assert.ok(!recipientsOf(deps.store, "lesson_no_attendance").includes(SYSTEM_TZ));
  assert.ok(!recipientsOf(deps.store, "lesson_no_attendance").includes(OTHER_GUIDE.tz));

  // A later slot the same day does not repeat it.
  const before = deps.store.docs.length;
  await runAlertJob({ now: at("14:30"), deps });
  assert.equal(deps.store.docs.filter((d) => d.type === "lesson_no_attendance").length, 3);
  assert.equal(deps.store.docs.length, before);
});

test("no lesson_no_attendance for a lesson with rows, not yet ended, on another day, or without students", async () => {
  const cases = [
    fakeDeps({ attendance: [row(TODAY, PRESENT)] }),
    fakeDeps({ lessons: [lesson({ date: { day: 3, startMin: 900, endMin: 960 } })] }),
    fakeDeps({ lessons: [lesson({ date: { day: 4, startMin: 600, endMin: 660 } })] }),
    fakeDeps({ lessons: [lesson({ list_students: [] })] }),
  ];
  for (const deps of cases) {
    await runAlertJob({ now: at("14:00"), deps });
    assert.deepEqual(recipientsOf(deps.store, "lesson_no_attendance"), []);
  }
});

test("absence_streak: three absences in a row reach the student's scope, not an out-of-scope guide", async () => {
  const attendance = [row(20261006, PRESENT), row(20261013, ABSENT), row(20261015, ABSENT), row(TODAY, ABSENT)];
  const deps = fakeDeps({ attendance });
  await runAlertJob({ now: at("14:00"), deps });
  const tzs = recipientsOf(deps.store, "absence_streak");
  assert.deepEqual(tzs, [ADMIN_U.tz, TEACHER.tz, HELPER_U.tz].sort());
  assert.ok(!tzs.includes(OTHER_GUIDE.tz));
  assert.ok(!tzs.includes(SYSTEM_TZ));
  assert.equal(deps.store.docs.find((d) => d.type === "absence_streak").link, `/students/${STUDENT.tz}`);

  await runAlertJob({ now: at("16:00"), deps });
  assert.equal(deps.store.docs.filter((d) => d.type === "absence_streak").length, 3, "once per streak");
});

test("no absence_streak when one of the last three was present", async () => {
  const attendance = [row(20261013, ABSENT), row(20261015, PRESENT), row(TODAY, ABSENT), row(20261008, ABSENT)];
  const deps = fakeDeps({ attendance });
  await runAlertJob({ now: at("14:00"), deps });
  assert.deepEqual(recipientsOf(deps.store, "absence_streak"), []);
});

test("report_missing: from 20:00 a teacher with a lesson today and no report today is alerted once", async () => {
  const early = fakeDeps({ attendance: [row(TODAY, PRESENT)] });
  await runAlertJob({ now: at("19:45"), deps: early });
  assert.deepEqual(recipientsOf(early.store, "report_missing"), []);

  const deps = fakeDeps({ attendance: [row(TODAY, PRESENT)], reports: [{ date: new Date("2026-10-19T00:00:00Z"), createdBy: TEACHER._id }] });
  await runAlertJob({ now: at("20:00"), deps });
  assert.deepEqual(recipientsOf(deps.store, "report_missing"), [TEACHER.tz]);
  assert.equal(deps.store.docs.find((d) => d.type === "report_missing").link, "/reports");
  await runAlertJob({ now: at("20:30"), deps });
  assert.deepEqual(recipientsOf(deps.store, "report_missing"), [TEACHER.tz], "once per day");
});

test("no report_missing when the teacher wrote a report dated today (by _id or tz)", async () => {
  for (const createdBy of [TEACHER._id, TEACHER.tz]) {
    const deps = fakeDeps({ attendance: [row(TODAY, PRESENT)], reports: [{ date: new Date("2026-10-20T00:00:00Z"), createdBy }] });
    await runAlertJob({ now: at("20:15"), deps });
    assert.deepEqual(recipientsOf(deps.store, "report_missing"), []);
  }
});

test("one failing check does not stop the others", async () => {
  const deps = fakeDeps({ attendance: [row(20261013, ABSENT), row(20261015, ABSENT), row(TODAY, ABSENT)] });
  deps.attendanceForDay = async () => { throw new Error("db down"); };
  const result = await runAlertJob({ now: at("14:00"), deps });
  assert.ok(result.errors.length >= 1);
  assert.ok(recipientsOf(deps.store, "absence_streak").length > 0);
});

test("JobRuns has a unique lockKey index and a 7-day TTL, both only on lock rows", () => {
  const { JOB_RUN_INDEXES } = require("../Entities/Notice/Notice.model");
  const lockRows = { lockKey: { $type: "string" } };
  assert.deepEqual(JSON.parse(JSON.stringify(JOB_RUN_INDEXES)), [
    { key: { lockKey: 1 }, options: { unique: true, partialFilterExpression: lockRows } },
    { key: { lockedAt: 1 }, options: { expireAfterSeconds: 7 * 24 * 60 * 60, partialFilterExpression: lockRows } },
  ]);
});

/* ---------------- fix round 1: one alert per streak, auto absences ---------------- */

const { AUTO_ABSENCE_NOTE } = require("../utils/attendanceMarks");

test("four consecutive absences across days give exactly one absence_streak alert (keyed on the streak start)", async () => {
  const attendance = [row(20261006, PRESENT), row(20261008, ABSENT), row(20261013, ABSENT), row(20261015, ABSENT)];
  const store = alertStore();
  const locks = new Set();
  await runAlertJob({ now: new Date("2026-10-15T14:00:00+03:00"), deps: fakeDeps({ attendance, store, locks }) });
  assert.equal(store.docs.filter((d) => d.type === "absence_streak").length, 3, "one per recipient");
  attendance.push(row(TODAY, ABSENT)); // the 4th absence
  await runAlertJob({ now: at("14:00"), deps: fakeDeps({ attendance, store, locks }) });
  const streak = store.docs.filter((d) => d.type === "absence_streak");
  assert.equal(streak.length, 3, "the 4th absence does not alert again");
  assert.ok(streak.every((d) => d.dedupKey === `absence_streak:${STUDENT._id}:20261008`));
});

test("absences created by the nightly job do not count toward a streak", async () => {
  for (const marker of [{ auto: true }, { notes: AUTO_ABSENCE_NOTE }]) {
    const attendance = [row(20261013, ABSENT, marker), row(20261015, ABSENT, marker), row(TODAY, ABSENT, marker)];
    const deps = fakeDeps({ attendance: [...attendance, row(20261008, ABSENT), row(20261006, ABSENT)] });
    await runAlertJob({ now: at("14:00"), deps });
    // Without the auto rows only two real absences remain: no streak.
    assert.deepEqual(recipientsOf(deps.store, "absence_streak"), [], JSON.stringify(marker));
  }
  const saved = fakeDeps({ attendance: [row(20261013, ABSENT, { auto: false, notes: AUTO_ABSENCE_NOTE }), row(20261015, ABSENT), row(TODAY, ABSENT)] });
  await runAlertJob({ now: at("14:00"), deps: saved });
  assert.equal(recipientsOf(saved.store, "absence_streak").length, 3, "a teacher-saved absence (auto: false) counts");
});

test("the student's rows are read newest first with a limit", async () => {
  const deps = fakeDeps({ attendance: [row(20261013, ABSENT), row(20261015, ABSENT), row(TODAY, ABSENT)] });
  const seen = [];
  const real = deps.attendanceOfStudent;
  deps.attendanceOfStudent = async (id, toKey, limit) => { seen.push(limit); return real(id, toKey, limit); };
  await runAlertJob({ now: at("14:00"), deps });
  assert.ok(seen.length && seen.every((n) => Number.isInteger(n) && n > 0 && n <= 100));
});

test("Attendances has a { student, dateKey: -1 } index for the absence-streak reads", async () => {
  const { ATTENDANCE_INDEXES, ensureAttendanceIndexes } = require("../Entities/Attendance/Attendance.model");
  assert.deepEqual(JSON.parse(JSON.stringify(ATTENDANCE_INDEXES)), [{ key: { student: 1, dateKey: -1 } }]);
  const made = [];
  await ensureAttendanceIndexes({ createIndex: async (key, options) => made.push([key, options]) });
  assert.deepEqual(made, [[{ student: 1, dateKey: -1 }, {}]]);
  const server = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "server.js"), "utf8");
  assert.match(server, /ensureAttendanceIndexes\(\)/, "server.js does not create the Attendance index at startup");
});
