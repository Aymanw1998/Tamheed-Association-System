// Staff pushes from the alert engine: every alert type pushes (owner,
// 2026-11-17), and a push failure never fails raise.
const assert = require("node:assert/strict");
const test = require("node:test");
const { createAlertEngine } = require("../services/alertEngine");

// Active users: A and B are managers; C is a guide whose tasks.view was taken away.
const USERS = [
  { _id: "a", tz: "A", roles: ["ادارة"] },
  { _id: "b", tz: "B", roles: ["ادارة"] },
  { _id: "c", tz: "C", roles: ["مرشد"], permissionRevokes: ["tasks.view"] },
  { _id: "coach", tz: "COACH", roles: ["مرشد"], permissionGrants: ["sports.coach"] },
  { _id: "it", tz: "IT", isIT: true, roles: [] },
];

function setup(pushImpl, users = USERS) {
  const calls = [];
  const logs = [];
  const docs = [];
  const engine = createAlertEngine({
    listActiveUsers: async () => users,
    findStudentById: async () => null,
    lessonsWithStudent: async () => [],
    store: {
      async insertOnce(doc) {
        if (docs.some((d) => d.recipientTz === doc.recipientTz && d.dedupKey === doc.dedupKey)) return { created: false };
        docs.push(doc);
        return { created: true };
      },
    },
    push: { sendToStaff: async (...args) => { calls.push(args); return pushImpl ? pushImpl(...args) : { sent: 1, removed: 0 }; } },
    log: (...args) => logs.push(args),
  });
  return { engine, calls, logs };
}

const text = { ar: "درس X انتهى دون تسجيل حضور", he: "he", en: "en" };
const alert = (extra = {}) => ({ type: "lesson_no_attendance", severity: "important", text, link: "/lessons/1", dedupKey: "k1", recipients: ["A", "B"], ...extra });

test("a lesson_no_attendance alert pushes the rendered text to its recipients", async () => {
  const { engine, calls } = setup();
  await engine.raise(alert());
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][0], ["A", "B"]);
  assert.deepEqual(calls[0][1], { title: "تمهيد", body: text.ar, url: "/lessons/1" });
});

test("a sport_lesson_no_attendance alert pushes; the url falls back to /", async () => {
  const { engine, calls } = setup();
  await engine.raise(alert({ type: "sport_lesson_no_attendance", link: "", recipients: ["COACH"] }));
  assert.equal(calls[0][1].url, "/");
});

// Owner (2026-11-01): three absences in a row reach the phones of those
// who get the alert (the responsible guide, the lessons' teachers).
test("an absence_streak alert pushes to its recipients, linked to the student", async () => {
  const { engine, calls } = setup();
  await engine.raise(alert({ type: "absence_streak", link: "/students/800000001" }));
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].url, "/students/800000001");
});

test("every other alert type pushes too (vehicles, reports, access, tasks)", async () => {
  for (const type of ["vehicle_license", "vehicle_test", "vehicle_insurance", "report_missing", "access_changed", "weekly_tasks", "weekly_task_added", "weekly_tasks_greeting"]) {
    const { engine, calls } = setup();
    await engine.raise(alert({ type }));
    assert.equal(calls.length, 1, type);
  }
  for (const type of ["account_locked", "admin_added"]) {
    const { engine, calls } = setup();
    await engine.raise(alert({ type, recipients: ["IT"] }));
    assert.deepEqual(calls[0][0], ["IT"], type);
  }
});

test("only newly created recipients are pushed (a repeat raise pushes nobody)", async () => {
  const { engine, calls } = setup();
  await engine.raise(alert());
  await engine.raise(alert());
  assert.equal(calls.length, 1);
});

test("a push failure does not fail raise", async () => {
  const { engine, logs } = setup(() => { throw new Error("push down"); });
  const res = await engine.raise(alert());
  assert.deepEqual(res.created, ["A", "B"]);
  assert.equal(logs.length, 1);
});

// Codex review, 2026-11-18: the phone follows the same rule as the inbox.
test("a phone gets only the alerts its owner may still read in the app", async () => {
  const { engine, calls } = setup();
  await engine.raise(alert({ type: "weekly_tasks_greeting", recipients: ["A", "C"] }));
  assert.deepEqual(calls[0][0], ["A"]);
  const only = setup();
  await only.engine.raise(alert({ type: "weekly_tasks_greeting", recipients: ["C"], dedupKey: "k2" }));
  assert.equal(only.calls.length, 0, "no push when nobody may read it");
  const gone = setup();
  await gone.engine.raise(alert({ recipients: ["A", "Z"], dedupKey: "k3" }));
  assert.deepEqual(gone.calls[0][0], ["A"], "a user no longer active gets nothing");
});

test("a locked account gets no push, also an IT user; only the system account is never locked", async () => {
  const lockedAt = new Date("2026-11-18T08:00:00Z");
  const users = [
    { _id: "a", tz: "A", roles: ["ادارة"] },
    { _id: "l", tz: "L", roles: ["ادارة"], lockedAt },
    { _id: "it", tz: "IT", isIT: true, roles: [], lockedAt },
  ];
  const { engine, calls } = setup(null, users);
  await engine.raise(alert({ recipients: ["A", "L", "IT"], dedupKey: "lock" }));
  assert.deepEqual(calls[0][0], ["A"]);
});
