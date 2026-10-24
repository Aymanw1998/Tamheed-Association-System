// Player pushes: the training reminder (sportPushJob) and the card-change push
// (cardPush, hooked into the staff sport controller). Everything is stubbed:
// no database, no network.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { auditStub } = require("./helpers/auditStub");
const { matches } = require("./helpers/memoryModel");
const { runReminderSlot } = require("../services/sportPushJob");
const { createCardPush } = require("../utils/cardPush");

/* ---------- training reminder ---------- */
// 2026-10-25 is a Sunday (day 1); Israel is UTC+2 on that date.
const at = (hhmm) => new Date(`2026-10-25T${hhmm}:00+02:00`);
const lesson = (id, day, startMin, players = ["p1", "p2"]) =>
  ({ _id: id, date: { day, startMin, endMin: startMin + 60 }, players: players.map((studentId) => ({ studentId })) });

function jobWorld(lessons) {
  const sends = [];
  const locks = new Set();
  const deps = {
    listSportLessons: async () => lessons,
    acquireLock: async (key) => (locks.has(key) ? false : (locks.add(key), true)),
    sendToStudents: async (ids, payload) => { sends.push({ ids, payload }); return { sent: ids.length, removed: 0 }; },
    log() {},
  };
  return { deps, sends, locks };
}

test("a Sunday 17:00 lesson is reminded at 16:03, once, even across overlapping windows", async () => {
  const { deps, sends, locks } = jobWorld([lesson("L1", 1, 17 * 60)]);
  assert.deepEqual(await runReminderSlot(deps, at("16:03")), { sent: 1 });
  assert.equal(sends.length, 1);
  assert.deepEqual(sends[0].ids, ["p1", "p2"]);
  assert.deepEqual(sends[0].payload, { title: "تمهيد - رياضة", body: "تدريبك اليوم الساعة 17:00", url: "/" });
  assert.deepEqual([...locks], ["sport-reminder:L1:2026-10-25"]);
  assert.deepEqual(await runReminderSlot(deps, at("16:03")), { sent: 0 });
  assert.deepEqual(await runReminderSlot(deps, at("16:05")), { sent: 0 });
  assert.equal(sends.length, 1);
});

test("a lesson outside the 55-60 minute window, on another weekday, or without players is not reminded", async () => {
  const { deps, sends } = jobWorld([lesson("L2", 1, 17 * 60 + 30), lesson("L3", 2, 17 * 60), lesson("L4", 1, 17 * 60, [])]);
  assert.deepEqual(await runReminderSlot(deps, at("16:03")), { sent: 0 });
  assert.equal(sends.length, 0);
});

test("the time in the text is zero-padded", async () => {
  const { deps, sends } = jobWorld([lesson("L5", 1, 9 * 60 + 5)]);
  await runReminderSlot(deps, at("08:07"));
  assert.equal(sends[0].payload.body, "تدريبك اليوم الساعة 09:05");
});

/* ---------- card push ---------- */
function cardWorld(rows = [{ _id: "r1", studentId: "p1", lastCardPushAt: null }]) {
  const docs = rows.map((r) => ({ ...r }));
  const sends = [];
  const players = {
    async get(filter) { return { success: true, result: docs.filter((d) => matches(d, filter)) }; },
    async updateExisting(filter, patch) {
      const hit = docs.find((d) => matches(d, filter));
      if (hit) Object.assign(hit, patch);
      return { success: true, result: hit || null };
    },
  };
  const push = { sendToStudents: async (ids, payload) => { sends.push({ ids, payload }); return { sent: ids.length, removed: 0 }; } };
  return { notify: createCardPush({ players, push }), sends };
}
const min = (n) => new Date(Date.UTC(2026, 9, 25, 10, n));

test("two calls 3 minutes apart push once; a call 11 minutes after the first pushes again", async () => {
  const { notify, sends } = cardWorld();
  assert.equal(await notify(["p1"], min(0)), 1);
  assert.equal(await notify(["p1"], min(3)), 0);
  assert.equal(await notify(["p1"], min(11)), 1);
  assert.equal(sends.length, 2);
  assert.deepEqual(sends[0].ids, ["p1"]);
  assert.deepEqual(sends[0].payload, { title: "تمهيد - رياضة", body: "تم تحديث بطاقتك", url: "/" });
});

test("a student who is not a player gets nothing", async () => {
  const { notify, sends } = cardWorld();
  assert.equal(await notify(["nobody"], min(0)), 0);
  assert.equal(sends.length, 0);
});

/* ---------- controller hooks ---------- */
function load(file, dependencies, DateImpl = Date) {
  const filename = path.join(__dirname, "../Entities", file);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, Date: DateImpl, Set, Map, Number, String, Array, Promise, console: { log() {}, warn() {}, error() {} },
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return module.exports;
}

function store(seed) {
  const docs = seed.map((d) => structuredClone(d));
  return {
    async get(filter = {}) { return { success: true, result: docs.filter((d) => matches(d, filter)).map((d) => structuredClone(d)) }; },
    async create(data) {
      const d = { _id: String(docs.length + 1).padStart(24, "e"), ...structuredClone(data) };
      docs.push(d);
      return { success: true, result: d };
    },
    async updateExisting(filter, patch) {
      const hit = docs.find((d) => matches(d, filter));
      if (hit) Object.assign(hit, structuredClone(patch));
      return { success: true, result: hit };
    },
  };
}

function controllerWorld(notify) {
  const SPORT = "a".repeat(24);
  const LESSON = "b".repeat(24);
  const players = store([{ _id: "c".repeat(24), studentId: "p1", sportId: SPORT, stats: {} }]);
  players.bumpStat = async () => 1;
  const FIXED = new Date("2026-10-25T10:00:00.000Z").getTime();
  const Frozen = class extends Date {
    constructor(...a) { if (a.length) super(...a); else super(FIXED); }
    static now() { return FIXED; }
  };
  const controller = load("Sport/Sport.controller.js", {
    crypto: require("node:crypto"),
    "./Sport.model": { SportModelDef: store([{ _id: SPORT, name: "كرة القدم", icon: "⚽", stats: [{ key: "goals", label: "أهداف" }] }]) },
    "./SportPlayer.model": { SportPlayerModelDef: players },
    "./SportLesson.model": { SportLessonModelDef: store([{ _id: LESSON, sportId: SPORT, name: "x", date: { day: 1, startMin: 1000, endMin: 1060 }, players: [{ studentId: "p1" }, { studentId: "p2" }] }]) },
    "./SportAttendance.model": { SportAttendanceModelDef: store([]) },
    "../Student/Student.model": { StudentModelDef: store([]) },
    "../Lesson/Lesson.model": { LessonModelDef: store([]) },
    "../../middleware/logger": { logWithSource() {} },
    "../../utils/sportCards": require("../utils/sportCards"),
    "../../utils/lessonConflict": require("../utils/lessonConflict"),
    "../../utils/cardPush": { notifyCardChanged: notify },
    ...auditStub().deps,
  }, Frozen);
  return { controller, LESSON };
}
const res = () => ({ statusCode: 200, body: undefined, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });

test("a stat bump pushes the player's card change and still answers 200", async () => {
  const calls = [];
  const { controller } = controllerWorld(async (ids) => { calls.push([...ids]); });
  const r = res();
  await controller.bumpStat({ params: { studentId: "p1" }, body: { key: "goals", delta: 1 }, user: {} }, r);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(calls, [["p1"]]);
});

test("saving attendance pushes only the students whose mark was saved", async () => {
  const calls = [];
  const { controller, LESSON } = controllerWorld(async (ids) => { calls.push([...ids]); });
  const r = res();
  await controller.saveAttendance({ params: { id: LESSON }, body: { date: "2026-10-25", marks: [{ studentId: "p1", status: "حاضر" }] }, user: {} }, r);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(calls, [["p1"]]);
});

test("a failing push (rejected or thrown) never fails the response", async () => {
  for (const notify of [async () => { throw new Error("boom"); }, () => { throw new Error("boom"); }]) {
    const { controller } = controllerWorld(notify);
    const r = res();
    await controller.bumpStat({ params: { studentId: "p1" }, body: { key: "goals", delta: 1 }, user: {} }, r);
    assert.equal(r.statusCode, 200);
  }
});
