// Staff pushes from the alert engine: only no-attendance alerts push, and a
// push failure never fails raise.
const assert = require("node:assert/strict");
const test = require("node:test");
const { createAlertEngine } = require("../services/alertEngine");

function setup(pushImpl) {
  const calls = [];
  const logs = [];
  const docs = [];
  const engine = createAlertEngine({
    listActiveUsers: async () => [],
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
  await engine.raise(alert({ type: "sport_lesson_no_attendance", link: "" }));
  assert.equal(calls[0][1].url, "/");
});

test("other alert types send no push", async () => {
  const { engine, calls } = setup();
  await engine.raise(alert({ type: "absence_streak" }));
  assert.equal(calls.length, 0);
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
