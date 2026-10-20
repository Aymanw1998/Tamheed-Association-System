// The alert engine: who receives each alert type (permission and scope
// filtered, active users only, the system account only where the type says
// so), one row per recipient per dedup key, texts in ar/he/en, and the
// /api/alerts inbox (each user sees only their own alerts).
const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");

const { createAlertEngine } = require("../services/alertEngine");
const { createAlertEvents } = require("../services/alertEvents");
const { ALERT_TEMPLATES, renderAlert } = require("../services/alertTemplates");
const { createAlertRouter } = require("../Entities/Alert/Alert.route");
const { ALERT_INDEXES } = require("../Entities/Alert/Alert.model");

// Synthetic identifiers only.
const SYSTEM_TZ = "SYS-ALERT";
const ADMIN = "ادارة";
const GUIDE = "مرشد";
const HELPER = "مساعد";

const SYS = { _id: "s".repeat(24), tz: SYSTEM_TZ, firstname: "Sys", lastname: "Tem" };
const ADMIN_U = { _id: "a".repeat(24), tz: "t-admin", firstname: "Ad", lastname: "Min", role: ADMIN, roles: [ADMIN] };
const MANAGER = { _id: "m".repeat(24), tz: "t-manager", firstname: "Man", lastname: "Ager", role: ADMIN, roles: [ADMIN],
  permissionGrants: ["users.unlock", "audit.view"] };
const GUIDE_U = { _id: "g".repeat(24), tz: "t-guide", firstname: "Gu", lastname: "Ide", role: GUIDE, roles: [GUIDE] };
const GUIDE_2 = { _id: "f".repeat(24), tz: "t-guide-2", firstname: "Other", lastname: "Guide", role: GUIDE, roles: [GUIDE] };
const HELPER_U = { _id: "h".repeat(24), tz: "t-helper", firstname: "He", lastname: "Lper", role: HELPER, roles: [HELPER] };
const USERS = [SYS, ADMIN_U, MANAGER, GUIDE_U, GUIDE_2, HELPER_U];

const STUDENT = { _id: "1".repeat(24), tz: "stu-1", firstname: "Kid", lastname: "One", main_teacher: GUIDE_U._id };
const LESSON = { _id: "2".repeat(24), name: "Lesson", teacher: GUIDE_U._id, helper: HELPER_U._id, list_students: [STUDENT._id] };

const plain = (v) => JSON.parse(JSON.stringify(v));
const sorted = (list) => [...list].sort();

// In-memory AiAlerts with the unique { recipientTz, dedupKey } rule.
function alertStore() {
  const docs = [];
  let next = 1;
  return {
    docs,
    async insertOnce(doc) {
      if (docs.some((d) => d.recipientTz === doc.recipientTz && d.dedupKey === doc.dedupKey)) return { created: false };
      const saved = { _id: String(next++).padStart(24, "0"), ...doc };
      docs.push(saved);
      return { created: true, alert: saved };
    },
    async listFor(recipientTz, { unreadOnly = false, limit = 50, types } = {}) {
      const mine = docs.filter((d) => d.recipientTz === recipientTz && (!unreadOnly || !d.readAt)
        && (!Array.isArray(types) || types.includes(d.type)));
      const result = mine.sort((a, b) => new Date(b.at) - new Date(a.at) || (a._id < b._id ? 1 : -1)).slice(0, limit);
      return { result, total: mine.length };
    },
    async markRead(recipientTz, id, at) {
      const hit = docs.find((d) => d._id === id && d.recipientTz === recipientTz);
      if (!hit) return null;
      if (!hit.readAt) hit.readAt = at;
      return hit;
    },
    async markAllRead(recipientTz, at) {
      let n = 0;
      for (const d of docs) if (d.recipientTz === recipientTz && !d.readAt) { d.readAt = at; n += 1; }
      return n;
    },
    async since(recipientTz, from, limit = 500) {
      return docs.filter((d) => d.recipientTz === recipientTz && !d.readAt && new Date(d.at) >= new Date(from)).slice(0, limit);
    },
  };
}

function makeEngine({ users = USERS, clock = { now: new Date("2026-10-20T11:00:00Z") } } = {}) {
  const store = alertStore();
  const engine = createAlertEngine({
    listActiveUsers: async () => users.map((u) => ({ ...u })),
    findStudentById: async (id) => (id === STUDENT._id ? { ...STUDENT } : null),
    lessonsWithStudent: async (id) => (LESSON.list_students.includes(id) ? [{ ...LESSON }] : []),
    store,
    systemTz: SYSTEM_TZ,
    now: () => new Date(clock.now),
  });
  return { engine, store, clock };
}

const recipientsOf = (store, type) => sorted(store.docs.filter((d) => d.type === type).map((d) => d.recipientTz));

/* ---------------- recipientsFor ---------------- */

test("a permission rule reaches active holders only, never the system account", async () => {
  const { engine } = makeEngine();
  assert.deepEqual(sorted(await engine.recipientsFor({ permission: "users.approve" })), sorted([ADMIN_U.tz, MANAGER.tz]));
  assert.deepEqual(sorted(await engine.recipientsFor({ permissions: ["students.viewAll", "students.edit"] })), sorted([ADMIN_U.tz, MANAGER.tz]));
  assert.deepEqual(await engine.recipientsFor({ permission: "audit.view" }), [MANAGER.tz]);
});

test("system: true adds the system account; alone it means the system account only", async () => {
  const { engine } = makeEngine();
  assert.deepEqual(sorted(await engine.recipientsFor({ permission: "users.unlock", system: true })), sorted([MANAGER.tz, SYSTEM_TZ]));
  assert.deepEqual(await engine.recipientsFor({ system: true }), [SYSTEM_TZ]);
});

test("a tz or user-id rule reaches only that active user, never the system account", async () => {
  const { engine } = makeEngine();
  assert.deepEqual(await engine.recipientsFor({ tz: GUIDE_U.tz }), [GUIDE_U.tz]);
  assert.deepEqual(await engine.recipientsFor({ tz: SYSTEM_TZ }), []);
  assert.deepEqual(await engine.recipientsFor({ tz: "not-active" }), []);
  assert.deepEqual(sorted(await engine.recipientsFor({ userIds: [GUIDE_U._id, HELPER_U._id, SYS._id] })), sorted([GUIDE_U.tz, HELPER_U.tz]));
  assert.deepEqual(await engine.recipientsFor({}), [], "an empty rule reaches nobody");
});

test("scopeOfStudent: main teacher, lesson teacher/helper and students.viewAll holders; not an out-of-scope guide", async () => {
  const { engine } = makeEngine();
  const tzs = await engine.recipientsFor({ scopeOfStudent: STUDENT._id, permission: "attendance.view" });
  assert.deepEqual(sorted(tzs), sorted([GUIDE_U.tz, HELPER_U.tz, ADMIN_U.tz, MANAGER.tz]));
  assert.ok(!tzs.includes(GUIDE_2.tz));
  assert.ok(!tzs.includes(SYSTEM_TZ));
});

test("a list of rules is their union", async () => {
  const { engine } = makeEngine();
  const tzs = await engine.recipientsFor([{ permission: "audit.view" }, { tz: GUIDE_U.tz }]);
  assert.deepEqual(sorted(tzs), sorted([MANAGER.tz, GUIDE_U.tz]));
});

/* ---------------- raise ---------------- */

test("raise writes one unread row per recipient and skips a repeated dedup key", async () => {
  const { engine, store } = makeEngine();
  const text = renderAlert("user_waiting", { name: "New Person" });
  const first = await engine.raise({ type: "user_waiting", severity: "important", text, link: "/users", dedupKey: "k1", recipients: [ADMIN_U.tz, MANAGER.tz, ADMIN_U.tz, ""] });
  assert.deepEqual(sorted(first.created), sorted([ADMIN_U.tz, MANAGER.tz]));
  assert.equal(store.docs.length, 2);
  const row = store.docs[0];
  assert.equal(row.type, "user_waiting");
  assert.equal(row.severity, "important");
  assert.equal(row.link, "/users");
  assert.equal(row.dedupKey, "k1");
  assert.equal(row.readAt, null);
  assert.ok(row.at instanceof Date);
  assert.deepEqual(Object.keys(row.text).sort(), ["ar", "en", "he"]);

  const second = await engine.raise({ type: "user_waiting", severity: "important", text, link: "/users", dedupKey: "k1", recipients: [ADMIN_U.tz] });
  assert.deepEqual(second.created, []);
  assert.equal(store.docs.length, 2);
});

test("raise refuses a text without ar/he/en or an unknown severity", async () => {
  const { engine } = makeEngine();
  await assert.rejects(engine.raise({ type: "x", severity: "important", text: { ar: "a" }, dedupKey: "k", recipients: ["t"] }));
  await assert.rejects(engine.raise({ type: "x", severity: "loud", text: { ar: "a", he: "b", en: "c" }, dedupKey: "k", recipients: ["t"] }));
});

test("AiAlerts has the unique { recipientTz, dedupKey } index and the stream index", () => {
  assert.deepEqual(plain(ALERT_INDEXES.find((i) => i.key.dedupKey)), { key: { recipientTz: 1, dedupKey: 1 }, options: { unique: true } });
  assert.ok(ALERT_INDEXES.some((i) => i.key.recipientTz === 1 && i.key.at === 1));
  assert.deepEqual(plain(ALERT_INDEXES.find((i) => i.options?.expireAfterSeconds)), { key: { at: 1 }, options: { expireAfterSeconds: 180 * 24 * 60 * 60 } });
});

/* ---------------- templates ---------------- */

test("every alert type renders a short ar/he/en text", () => {
  const params = { name: "Some Name", count: 5, lesson: "Lesson", plate: "1234567", nickname: "Van", level: "due30", daysLeft: 30, dueDate: "2026-11-19", change: "role", self: false };
  for (const type of Object.keys(ALERT_TEMPLATES)) {
    const text = renderAlert(type, params);
    for (const lang of ["ar", "he", "en"]) {
      assert.equal(typeof text[lang], "string", `${type}.${lang}`);
      assert.ok(text[lang].trim().length > 0 && text[lang].length <= 200, `${type}.${lang} length`);
    }
  }
  for (const type of ["parent_registration", "user_waiting", "account_locked", "access_changed", "system_login_failures",
    "lesson_no_attendance", "absence_streak", "report_missing", "vehicle_license", "vehicle_test", "vehicle_insurance"]) {
    assert.ok(ALERT_TEMPLATES[type], `template for ${type}`);
  }
});

/* ---------------- event hooks: each type reaches exactly the right users ---------------- */

function makeEvents(opts) {
  const made = makeEngine(opts);
  return { ...made, events: createAlertEvents({ engine: made.engine, now: () => new Date(made.clock.now) }) };
}

test("parent_registration reaches students.viewAll + students.edit holders; not a guide", async () => {
  const { events, store } = makeEvents();
  await events.parentRegistered({ _id: "3".repeat(24), firstname: "New", lastname: "Kid" });
  assert.deepEqual(recipientsOf(store, "parent_registration"), sorted([ADMIN_U.tz, MANAGER.tz]));
  assert.equal(store.docs[0].link, "/students");
});

test("user_waiting reaches users.approve holders, once per day", async () => {
  const { events, store, clock } = makeEvents();
  const waiting = { tz: "t-new", firstname: "New", lastname: "User" };
  await events.userWaiting(waiting);
  await events.userWaiting(waiting);
  assert.deepEqual(recipientsOf(store, "user_waiting"), sorted([ADMIN_U.tz, MANAGER.tz]));
  clock.now = new Date("2026-10-21T11:00:00Z");
  await events.userWaiting(waiting);
  assert.equal(store.docs.length, 4, "a new day is a new alert");
});

test("account_locked reaches users.unlock holders and the system account", async () => {
  const { events, store } = makeEvents();
  await events.accountLocked({ tz: GUIDE_U.tz, firstname: "Gu", lastname: "Ide" });
  assert.deepEqual(recipientsOf(store, "account_locked"), sorted([MANAGER.tz, SYSTEM_TZ]));
  assert.equal(store.docs[0].severity, "critical");
  assert.equal(store.docs[0].link, `/users/${GUIDE_U.tz}`);
});

test("access_changed reaches audit.view holders and the target user (with its own text)", async () => {
  const { events, store } = makeEvents();
  await events.accessChanged({ tz: GUIDE_U.tz, firstname: "Gu", lastname: "Ide" }, { change: "permissions" });
  assert.deepEqual(recipientsOf(store, "access_changed"), sorted([MANAGER.tz, GUIDE_U.tz]));
  const self = store.docs.find((d) => d.recipientTz === GUIDE_U.tz);
  const other = store.docs.find((d) => d.recipientTz === MANAGER.tz);
  assert.notEqual(self.text.en, other.text.en);
  assert.equal(self.link, "/profile", "the user's own alert opens their profile");
  assert.equal(other.link, `/users/${GUIDE_U.tz}`);
});

test("access_changed never alerts the actor who made the change", async () => {
  const { events, store } = makeEvents();
  await events.accessChanged({ tz: GUIDE_U.tz, firstname: "Gu", lastname: "Ide" }, { change: "role", actorTz: MANAGER.tz });
  assert.deepEqual(recipientsOf(store, "access_changed"), [GUIDE_U.tz]);
});

test("access_changed of a user who is not active reaches only the audit.view holders", async () => {
  const { events, store } = makeEvents();
  await events.accessChanged({ tz: "t-waiting", firstname: "W", lastname: "U" }, { change: "role" });
  assert.deepEqual(recipientsOf(store, "access_changed"), [MANAGER.tz]);
});

test("system_login_failures reaches the system account only", async () => {
  const { events, store } = makeEvents();
  await events.systemLoginFailures(5);
  await events.systemLoginFailures(10);
  assert.deepEqual(recipientsOf(store, "system_login_failures"), [SYSTEM_TZ, SYSTEM_TZ]);
  assert.equal(store.docs[0].severity, "critical");
});

test("vehicle stages reach vehicles.view holders under the notice's dedup key", async () => {
  const users = [...USERS.filter((u) => u !== GUIDE_U), { ...GUIDE_U, permissionGrants: ["vehicles.view"] }];
  const { events, store } = makeEvents({ users });
  const alert = { vehicleId: "v1", plate: "1234567", nickname: "Van", kind: "license", level: "due30", daysLeft: 30, dueDate: "2026-11-19" };
  const notice = { severity: "important", link: "/vehicles/v1", dedupKey: "vehicle:v1:license:due30:2026-11-19" };
  await events.vehicleStage(alert, notice);
  await events.vehicleStage(alert, notice);
  assert.deepEqual(recipientsOf(store, "vehicle_license"), sorted([ADMIN_U.tz, MANAGER.tz, GUIDE_U.tz]));
  assert.ok(store.docs.every((d) => d.dedupKey === notice.dedupKey && d.link === "/vehicles/v1"));
});

test("the system account receives no alert of a non-system type", async () => {
  const { events, store } = makeEvents();
  await events.parentRegistered({ _id: "3".repeat(24), firstname: "N", lastname: "K" });
  await events.userWaiting({ tz: "t-new", firstname: "N", lastname: "U" });
  await events.accessChanged({ tz: GUIDE_U.tz, firstname: "G", lastname: "U" }, { change: "role" });
  await events.vehicleStage({ vehicleId: "v1", plate: "1", kind: "test", level: "due7", daysLeft: 7, dueDate: "2026-10-27" },
    { severity: "critical", link: "/vehicles/v1", dedupKey: "vehicle:v1:test:due7:2026-10-27" });
  assert.ok(store.docs.length > 0);
  assert.ok(store.docs.every((d) => d.recipientTz !== SYSTEM_TZ));
});

/* ---------------- /api/alerts ---------------- */

async function startInbox(store, clock = { now: Date.UTC(2026, 9, 20, 11) }) {
  const app = express();
  const requireAuth = (req, res, next) => {
    const tz = req.headers["x-tz"];
    if (!tz) return res.status(401).json({ code: "NO_TOKEN" });
    req.user = { tz };
    return next();
  };
  // x-perms: the caller's current permission keys (comma list); x-system: 1 for the system account.
  const loadActor = (req, res, next) => {
    const perms = String(req.headers["x-perms"] || "").split(",").filter(Boolean);
    req.actor = { tz: req.user.tz, permissions: new Set(perms), isSystem: req.headers["x-system"] === "1" };
    next();
  };
  app.use("/api/alerts", createAlertRouter({ requireAuth, loadActor, store, now: () => new Date(clock.now) }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}/api/alerts` };
}

const seedRow = (store, recipientTz, n, extra = {}) => store.insertOnce({
  recipientTz, type: "report_missing", severity: "info", text: { ar: `a${n}`, he: `h${n}`, en: `e${n}` },
  link: "/users", dedupKey: `k${n}`, readAt: null, at: new Date(Date.UTC(2026, 9, 20, 8, n)), ...extra,
});

test("GET /api/alerts lists only the caller's alerts, newest first, at most 50; unread=1 filters", async () => {
  const store = alertStore();
  for (let n = 0; n < 55; n += 1) await seedRow(store, "t-a", n);
  await seedRow(store, "t-b", 99);
  await store.markRead("t-a", store.docs[54]._id, new Date());
  const { server, base } = await startInbox(store);
  try {
    assert.equal((await fetch(base)).status, 401);
    const all = await (await fetch(base, { headers: { "x-tz": "t-a" } })).json();
    assert.equal(all.ok, true);
    assert.equal(all.alerts.length, 50);
    assert.equal(all.alerts[0].text.en, "e54");
    assert.equal(all.alerts[0].read, true);
    assert.ok(all.alerts.every((a) => !a.text.en.includes("99")));
    assert.equal(all.alerts[0].recipientTz, undefined, "the recipient is not echoed");
    const unread = await (await fetch(`${base}?unread=1`, { headers: { "x-tz": "t-a" } })).json();
    assert.equal(unread.alerts[0].text.en, "e53");
    assert.equal(unread.total, 54);
  } finally { server.close(); }
});

test("POST /:id/read marks only one's own alert; another user's id is 404; read-all clears the rest", async () => {
  const store = alertStore();
  await seedRow(store, "t-a", 1);
  await seedRow(store, "t-a", 2);
  await seedRow(store, "t-b", 3);
  const [a1, , b3] = store.docs;
  const { server, base } = await startInbox(store);
  try {
    const mine = await fetch(`${base}/${a1._id}/read`, { method: "POST", headers: { "x-tz": "t-a" } });
    assert.equal(mine.status, 200);
    assert.ok(store.docs[0].readAt);
    const theirs = await fetch(`${base}/${b3._id}/read`, { method: "POST", headers: { "x-tz": "t-a" } });
    assert.equal(theirs.status, 404);
    assert.equal(store.docs[2].readAt, null);
    const bad = await fetch(`${base}/not-an-id/read`, { method: "POST", headers: { "x-tz": "t-a" } });
    assert.equal(bad.status, 404);
    const all = await (await fetch(`${base}/read-all`, { method: "POST", headers: { "x-tz": "t-a" } })).json();
    assert.deepEqual(plain(all), { ok: true, updated: 1 });
    assert.ok(store.docs[1].readAt);
    assert.equal(store.docs[2].readAt, null);
  } finally { server.close(); }
});

test("GET /api/alerts shows only the types the caller may still see (by current permission)", async () => {
  const store = alertStore();
  const types = ["parent_registration", "user_waiting", "account_locked", "access_changed", "system_login_failures",
    "lesson_no_attendance", "absence_streak", "report_missing", "vehicle_license", "vehicle_test", "vehicle_insurance", "made_up"];
  for (const [n, type] of types.entries()) await seedRow(store, "t-a", n, { type });
  const { server, base } = await startInbox(store);
  const typesFor = async (headers) => {
    const body = await (await fetch(base, { headers: { "x-tz": "t-a", ...headers } })).json();
    assert.equal(body.total, body.alerts.length);
    return body.alerts.map((a) => a.type).sort();
  };
  try {
    // Demoted to nothing: only the alerts about the caller's own work stay.
    assert.deepEqual(await typesFor({}), ["access_changed", "lesson_no_attendance", "report_missing"]);
    assert.deepEqual(await typesFor({ "x-perms": "students.viewAll" }), ["access_changed", "lesson_no_attendance", "report_missing"]);
    assert.deepEqual(await typesFor({ "x-perms": "students.viewAll,students.edit,users.approve,users.unlock,vehicles.view,attendance.view" }),
      ["absence_streak", "access_changed", "account_locked", "lesson_no_attendance", "parent_registration", "report_missing",
        "user_waiting", "vehicle_insurance", "vehicle_license", "vehicle_test"]);
    const system = await typesFor({ "x-system": "1" });
    assert.ok(system.includes("system_login_failures") && system.includes("account_locked"));
    assert.ok(!system.includes("made_up"), "an unknown type is never shown");
  } finally { server.close(); }
});

test("every alert type has a read rule (else GET /api/alerts would hide it)", () => {
  const { ALERT_ACCESS } = require("../services/alertAccess");
  assert.deepEqual(Object.keys(ALERT_TEMPLATES).sort(), Object.keys(ALERT_ACCESS).sort());
});
