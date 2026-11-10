const assert = require("node:assert/strict");
const test = require("node:test");
const { buildMonthlySummary, createMonthlySummary, previousPeriod, MANY_ABSENCES, FIRST_PERIOD } = require("../services/monthlySummaryJob");
const { AUTO_ABSENCE_NOTE } = require("../utils/attendanceMarks");

// The monthly summary to management (owner, 2026-11-10): on the 1st, last
// month's attendance by program, the students with many absences, and the
// meetings where nobody took attendance. Synthetic data only.
const L1 = "1".repeat(24);
const L2 = "2".repeat(24);
const S1 = "a".repeat(24);
const S2 = "b".repeat(24);
const U1 = "c".repeat(24);

const lessons = [{ _id: L1, name: "كرة القدم" }, { _id: L2, name: "الرسم <ب>" }];
const auto = (row) => ({ ...row, status: "غائب", notes: AUTO_ABSENCE_NOTE, auto: true });
const rows = [
  { lesson: L1, student: S1, dateKey: 20261102, status: "غائب" },
  { lesson: L1, student: S1, dateKey: 20261109, status: "غائب" },
  { lesson: L1, student: S1, dateKey: 20261116, status: "غائب" },
  { lesson: L1, student: S2, dateKey: 20261102, status: "حاضر" },
  { lesson: L1, student: S2, dateKey: 20261109, status: "متأخر" },
  { lesson: L1, user: U1, dateKey: 20261102, status: "حاضر" },
  auto({ lesson: L2, student: S2, dateKey: 20261104 }),
  auto({ lesson: L2, student: S1, dateKey: 20261104 }),
  { lesson: L2, student: S2, dateKey: 20261111, status: "حاضر" },
];
const names = new Map([[S1, "طالب أ"], [S2, "طالب ب"]]);

test("previousPeriod is last month by Israel time", () => {
  assert.deepEqual(previousPeriod(new Date("2026-12-01T06:30:00Z")), { period: "2026-11", fromKey: 20261101, toKey: 20261130, label: "11/2026" });
  assert.deepEqual(previousPeriod(new Date("2027-01-01T06:30:00Z")), { period: "2026-12", fromKey: 20261201, toKey: 20261231, label: "12/2026" });
  // 23:30 UTC on Nov 30 is already Dec 1 in Israel.
  assert.equal(previousPeriod(new Date("2026-11-30T23:30:00Z")).period, "2026-11");
});

test("the summary counts each program, students and staff apart", () => {
  const out = buildMonthlySummary({ lessons, rows, studentNames: names, label: "11/2026" });
  const football = out.stats.lessons.find((l) => l.name === "كرة القدم");
  assert.deepEqual(football, { name: "كرة القدم", meetings: 3, present: 2, absent: 3, rate: 40, staff: 1, unrecorded: 0 });
  const drawing = out.stats.lessons.find((l) => l.name === "الرسم <ب>");
  assert.equal(drawing.unrecorded, 1, "a meeting with only automatic absences was not recorded");
  assert.equal(drawing.absent, 0, "automatic absences are not counted as absences");
});

test("students with MANY_ABSENCES or more are listed, most first", () => {
  assert.equal(MANY_ABSENCES, 3);
  const out = buildMonthlySummary({ lessons, rows, studentNames: names, label: "11/2026" });
  assert.deepEqual(out.stats.absent, [{ name: "طالب أ", absences: 3 }]);
});

test("the email is right-to-left HTML with the names escaped", () => {
  const out = buildMonthlySummary({ lessons, rows, studentNames: names, label: "11/2026" });
  assert.equal(out.subject, "تمهيد: ملخص شهر 11/2026");
  assert.match(out.html, /dir="rtl"/);
  assert.match(out.html, /الرسم &lt;ب&gt;/);
  assert.doesNotMatch(out.html, /<ب>/);
});

function deps(overrides = {}) {
  const sent = [];
  const marked = [];
  return {
    sent, marked,
    listLessons: async () => lessons,
    listAttendance: async () => rows,
    studentNames: async () => names,
    listRecipients: async () => ["admin1@example.test", "admin2@example.test"],
    hasSent: async () => false,
    markSent: async (period, count) => marked.push({ period, count }),
    send: async (to, subject) => sent.push({ to, subject }),
    now: () => new Date("2026-12-01T07:00:00Z"),
    log: () => {},
    ...overrides,
  };
}

test("the job sends last month's summary to every admin, once", async () => {
  const d = deps();
  const out = await createMonthlySummary(d)();
  assert.equal(out.sent, 2);
  assert.deepEqual(d.sent.map((s) => s.to), ["admin1@example.test", "admin2@example.test"]);
  assert.deepEqual(d.marked, [{ period: "2026-11", count: 2 }]);
  const again = await createMonthlySummary({ ...d, hasSent: async () => true })();
  assert.deepEqual(again, { skipped: true });
});

test("before 08:00 on the 1st nothing is sent yet", async () => {
  const d = deps({ now: () => new Date("2026-12-01T04:00:00Z") });
  assert.deepEqual(await createMonthlySummary(d)(), { skipped: true });
  assert.equal(d.sent.length, 0);
});

test("a month with no attendance at all sends nothing and is still closed", async () => {
  const d = deps({ listAttendance: async () => [] });
  const out = await createMonthlySummary(d)();
  assert.equal(out.sent, 0);
  assert.equal(d.sent.length, 0);
  assert.deepEqual(d.marked, [{ period: "2026-11", count: 0 }]);
});

test("when every send fails the month stays open for the next tick", async () => {
  const d = deps({ send: async () => { throw new Error("smtp down"); } });
  const out = await createMonthlySummary(d)();
  assert.equal(out.sent, 0);
  assert.deepEqual(d.marked, []);
});

test("months before the job existed are never sent (the first is 11/2026)", async () => {
  assert.equal(FIRST_PERIOD, "2026-11");
  const d = deps({ now: () => new Date("2026-11-10T09:00:00Z") });
  assert.deepEqual(await createMonthlySummary(d)(), { skipped: true });
  assert.equal(d.sent.length, 0);
  assert.equal(d.marked.length, 0);
});
