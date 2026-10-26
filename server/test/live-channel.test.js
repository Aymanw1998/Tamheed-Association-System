// The authenticated live channel: POST /api/live/ticket hands a signed-in user
// a single-use 60 s ticket; GET /api/live/stream?ticket= streams only that
// user's LiveEvents (read from the database, so any server process works).
// The old open /api/events channel is gone, and storage changes reach only
// the people who can see the entry.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const express = require("express");

const { createLoadActor } = require("../middleware/permissionMiddleware");
const { createLiveRouter } = require("../Entities/Live/Live.route");
const { LIVE_TICKET_INDEXES } = require("../Entities/Live/LiveTicket.model");
const { LIVE_EVENT_INDEXES } = require("../Entities/Live/LiveEvent.model");
const { createLiveBus } = require("../services/liveBus");
const { createStorageRecipients } = require("../services/storageRecipients");
const { ensureIndexes } = require("../utils/ensureIndexes");
const { createOverlapCursor } = require("../services/overlapCursor");
const { actorFor } = require("./helpers/actors");
const { loadStorageController } = require("./helpers/storageController");

const SYSTEM_TZ = "SYS-TEST";

/* ---------------- in-memory stand-ins for the two collections ---------------- */

function ticketStore() {
  const docs = [];
  return {
    docs,
    async create(doc) { docs.push({ ...doc }); return { success: true }; },
    async consume(ticketHash, usedAt) {
      const doc = docs.find((d) => d.ticketHash === ticketHash && !d.usedAt);
      if (!doc) return null;
      doc.usedAt = usedAt;
      return { ...doc };
    },
  };
}

function eventStore() {
  const docs = [];
  let next = 1;
  return {
    docs,
    async create(doc) { const saved = { _id: String(next++).padStart(6, "0"), ...doc }; docs.push(saved); return { success: true, result: saved }; },
    // Like the model: rows with at >= from, in (at, _id) order.
    async since(recipientTz, from, limit) {
      return docs
        .filter((d) => d.recipientTz === recipientTz && new Date(d.at).getTime() >= new Date(from).getTime())
        .sort((a, b) => new Date(a.at) - new Date(b.at) || (a._id < b._id ? -1 : 1))
        .slice(0, limit);
    },
  };
}

async function startApp({ users, clock = { now: Date.now() }, options = {} }) {
  const tickets = ticketStore();
  const events = eventStore();
  const bus = createLiveBus({ model: events, now: () => new Date(clock.now) });
  const loadActor = createLoadActor({ systemTz: SYSTEM_TZ, findActiveUserByTz: async (tz) => users[tz] || null });
  const requireAuth = (req, res, next) => {
    const tz = req.headers["x-tz"];
    if (!tz) return res.status(401).json({ code: "NO_TOKEN" });
    req.user = { tz, iat: Math.floor(clock.now / 1000) };
    return next();
  };
  const app = express();
  const router = createLiveRouter({
    requireAuth, loadActor, tickets, events,
    now: () => clock.now, pollMs: 15, pingMs: 30, startAt: () => 0, visibleStudentIds: async () => null, ...options,
  });
  app.use("/api/live", router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}`, tickets, events, bus, clock, router };
}

async function getTicket(base, tz) {
  const res = await fetch(`${base}/api/live/ticket`, { method: "POST", headers: { "x-tz": tz } });
  return { status: res.status, body: await res.json() };
}

// Reads the stream for `ms`, then disconnects. Non-200 answers come back as JSON.
async function readStream(base, ticket, ms = 250) {
  const controller = new AbortController();
  const res = await fetch(`${base}/api/live/stream?ticket=${encodeURIComponent(ticket)}`, { signal: controller.signal });
  if (res.status !== 200) return { status: res.status, body: await res.json() };
  const timer = setTimeout(() => controller.abort(), ms);
  const decoder = new TextDecoder();
  let text = "";
  let ended = false; // the server closed the stream before we disconnected
  try {
    for await (const chunk of res.body) text += decoder.decode(chunk, { stream: true });
    ended = true;
  } catch { /* aborted */ } finally { clearTimeout(timer); }
  return { status: 200, text, ended, type: res.headers.get("content-type") };
}

const parseEvents = (text) => text.split("\n\n").map((block) => {
  const lines = block.split("\n");
  const event = lines.find((l) => l.startsWith("event: "));
  const data = lines.find((l) => l.startsWith("data: "));
  return event && { event: event.slice(7), data: JSON.parse(data.slice(6)) };
}).filter(Boolean);

const userA = { tz: "u-a", firstname: "Aa", lastname: "Aa", role: "مرشد" };
const userB = { tz: "u-b", firstname: "Bb", lastname: "Bb", role: "مرشد" };

/* ---------------- tickets and the stream ---------------- */

test("a signed-in user gets a ticket; only its hash is stored", async () => {
  const { server, base, tickets } = await startApp({ users: { [userA.tz]: { ...userA } } });
  try {
    const { status, body } = await getTicket(base, userA.tz);
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.ok(typeof body.ticket === "string" && body.ticket.length >= 32);
    assert.equal(tickets.docs.length, 1);
    assert.equal(tickets.docs[0].tz, userA.tz);
    assert.ok(!JSON.stringify(tickets.docs).includes(body.ticket), "raw ticket stored");
    assert.equal((await fetch(`${base}/api/live/ticket`, { method: "POST" })).status, 401);
  } finally { server.close(); }
});

test("a ticket works once; the second use is 401", async () => {
  const { server, base, bus } = await startApp({ users: { [userA.tz]: { ...userA } } });
  try {
    await bus.publish(userA.tz, "storage", { action: "file_renamed" });
    const { body } = await getTicket(base, userA.tz);
    const first = await readStream(base, body.ticket);
    assert.equal(first.status, 200);
    assert.match(first.type, /text\/event-stream/);
    assert.deepEqual(parseEvents(first.text), [{ event: "storage", data: { action: "file_renamed" } }]);
    const second = await readStream(base, body.ticket);
    assert.equal(second.status, 401);
    assert.equal(second.body.code, "TICKET_INVALID");
  } finally { server.close(); }
});

test("an expired ticket (61 s) is 401", async () => {
  const clock = { now: Date.UTC(2026, 9, 20, 10, 0, 0) };
  const { server, base } = await startApp({ users: { [userA.tz]: { ...userA } }, clock });
  try {
    const { body } = await getTicket(base, userA.tz);
    clock.now += 61 * 1000;
    const res = await readStream(base, body.ticket);
    assert.equal(res.status, 401);
    assert.equal(res.body.code, "TICKET_INVALID");
  } finally { server.close(); }
});

test("a missing or unknown ticket is 401", async () => {
  const { server, base } = await startApp({ users: { [userA.tz]: { ...userA } } });
  try {
    assert.equal((await readStream(base, "")).status, 401);
    assert.equal((await readStream(base, "not-a-ticket")).status, 401);
  } finally { server.close(); }
});

test("user A's ticket never yields user B's events", async () => {
  const users = { [userA.tz]: { ...userA }, [userB.tz]: { ...userB } };
  const { server, base, bus } = await startApp({ users });
  try {
    await bus.publish(userB.tz, "storage", { action: "secret-b" });
    await bus.publish(userA.tz, "storage", { action: "mine-a" });
    const { body } = await getTicket(base, userA.tz);
    const res = await readStream(base, body.ticket, 350);
    assert.equal(res.status, 200);
    assert.ok(!res.text.includes("secret-b"));
    assert.deepEqual(parseEvents(res.text).map((e) => e.data.action), ["mine-a"]);
  } finally { server.close(); }
});

test("events published while connected arrive, and a ping comment keeps the stream alive", async () => {
  const { server, base, bus } = await startApp({ users: { [userA.tz]: { ...userA } } });
  try {
    const { body } = await getTicket(base, userA.tz);
    setTimeout(() => bus.publish(userA.tz, "storage", { action: "later" }), 40);
    const res = await readStream(base, body.ticket, 350);
    assert.deepEqual(parseEvents(res.text).map((e) => e.data.action), ["later"]);
    assert.match(res.text, /^: ping$/m);
  } finally { server.close(); }
});

test("a locked or no-longer-active user's ticket is refused", async () => {
  const users = { [userA.tz]: { ...userA }, [userB.tz]: { ...userB } };
  const { server, base } = await startApp({ users });
  try {
    const a = (await getTicket(base, userA.tz)).body.ticket;
    const b = (await getTicket(base, userB.tz)).body.ticket;
    users[userA.tz].lockedAt = new Date();
    delete users[userB.tz];
    const locked = await readStream(base, a);
    assert.equal(locked.status, 423);
    assert.equal(locked.body.code, "ACCOUNT_LOCKED");
    const gone = await readStream(base, b);
    assert.equal(gone.status, 401);
    assert.equal(gone.body.code, "NO_ACTIVE");
    // A locked user cannot get a ticket either.
    assert.equal((await getTicket(base, userA.tz)).status, 423);
  } finally { server.close(); }
});

test("events whose ids arrive out of order are each delivered exactly once", async () => {
  const clock = { now: Date.UTC(2026, 9, 20, 10, 0, 0) };
  const { server, base, bus, events } = await startApp({ users: { [userA.tz]: { ...userA } }, clock });
  try {
    await bus.publish(userA.tz, "storage", { action: "second" }); // _id 000001
    const { body } = await getTicket(base, userA.tz);
    // Another process commits a row with a smaller _id and an earlier "at"
    // after this stream has already polled past it.
    setTimeout(() => {
      events.docs.push({ _id: "000000", recipientTz: userA.tz, type: "storage", payload: { action: "first" }, at: new Date(clock.now - 5000) });
      clock.now += 5000;
    }, 60);
    const res = await readStream(base, body.ticket, 300);
    assert.deepEqual(parseEvents(res.text).map((e) => e.data.action), ["second", "first"]);
  } finally { server.close(); }
});

test("the stream re-checks the user and ends once they are locked", async () => {
  const users = { [userA.tz]: { ...userA } };
  const { server, base } = await startApp({ users, options: { recheckEveryPolls: 2 } });
  try {
    const { body } = await getTicket(base, userA.tz);
    setTimeout(() => { users[userA.tz].lockedAt = new Date(); }, 40);
    const res = await readStream(base, body.ticket, 1000);
    assert.equal(res.ended, true, "stream still open after the user was locked");
  } finally { server.close(); }
});

test("the stream re-checks the user and ends once they leave the active room", async () => {
  const users = { [userA.tz]: { ...userA } };
  const { server, base } = await startApp({ users, options: { recheckEveryPolls: 2 } });
  try {
    const { body } = await getTicket(base, userA.tz);
    setTimeout(() => { delete users[userA.tz]; }, 40);
    assert.equal((await readStream(base, body.ticket, 1000)).ended, true);
  } finally { server.close(); }
});

test("an active user's stream stays open across re-checks, and every stream is capped", async () => {
  const { server, base } = await startApp({ users: { [userA.tz]: { ...userA } }, options: { recheckEveryPolls: 2 } });
  try {
    const open = await readStream(base, (await getTicket(base, userA.tz)).body.ticket, 200);
    assert.equal(open.ended, false);
  } finally { server.close(); }
  const capped = await startApp({ users: { [userA.tz]: { ...userA } }, options: { maxStreamMs: 80 } });
  try {
    const res = await readStream(capped.base, (await getTicket(capped.base, userA.tz)).body.ticket, 1000);
    assert.equal(res.ended, true, "stream not capped");
  } finally { capped.server.close(); }
});

/* ---------------- the overlap cursor ---------------- */

test("the overlap cursor re-reads a window and returns each row once", async () => {
  let clock = 100000;
  const rows = [];
  const asked = [];
  const cursor = createOverlapCursor({
    startAt: 100000, overlapMs: 30000, maxSeen: 3, now: () => clock,
    fetchSince: async (from) => { asked.push(from.getTime()); return rows.filter((r) => r.at >= from.getTime()); },
  });
  rows.push({ _id: "b", at: 99000 });
  assert.deepEqual((await cursor.next()).map((r) => r._id), ["b"]);
  assert.deepEqual(asked, [70000]);
  clock = 110000;
  rows.push({ _id: "a", at: 98000 }); // late commit, smaller id, earlier time
  assert.deepEqual((await cursor.next()).map((r) => r._id), ["a"]);
  assert.deepEqual(asked, [70000, 70000]); // from the previous poll's start - overlap
  clock = 120000;
  assert.deepEqual(await cursor.next(), []);
  assert.equal(asked[2], 80000);
  // The seen set is bounded.
  rows.push({ _id: "c", at: 119000 }, { _id: "d", at: 119000 });
  await cursor.next();
  assert.ok(cursor.seenSize() <= 3);
});

/* ---------------- the old open channel ---------------- */

test("/api/events and /api/test-event are gone and server errors are not broadcast", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.doesNotMatch(server, /app\.(get|use|all)\(\s*['"`]\/api\/events/, "/api/events still mounted");
  assert.doesNotMatch(server, /app\.(get|use|all)\(\s*['"`]\/api\/test-event/, "/api/test-event still mounted");
  assert.ok(!server.includes("utils/sse"), "server.js still uses the open SSE hub");
  assert.match(server, /app\.use\(['"]\/api\/live['"]/);
  assert.ok(!fs.existsSync(path.join(__dirname, "..", "utils", "sse.js")), "utils/sse.js still exists");

  const { errorPublisher } = require("../utils/errorPublisher");
  const source = fs.readFileSync(path.join(__dirname, "..", "utils", "errorPublisher.js"), "utf8");
  assert.ok(!/broadcast|liveBus/.test(source), "errorPublisher still broadcasts");
  const err = Object.assign(new Error("boom"), { status: 500 });
  const original = console.error;
  let passed;
  let logged = "";
  console.error = (...args) => { logged += args.join(" "); };
  try {
    errorPublisher(err, { method: "GET", path: "/api/x", originalUrl: "/api/x?token=secret" }, {}, (e) => { passed = e; });
  } finally { console.error = original; }
  assert.equal(passed, err);
  assert.ok(logged.includes("GET /api/x"), "path not logged");
  assert.ok(!logged.includes("secret"), "query string logged");
});

/* ---------------- the bus and the indexes ---------------- */

test("liveBus writes one LiveEvent per distinct recipient", async () => {
  const events = eventStore();
  const at = new Date(Date.UTC(2026, 9, 20));
  const bus = createLiveBus({ model: events, now: () => at });
  await bus.publish("t1", "storage", { action: "x" });
  await bus.publishToMany(["t2", "t3", "t2", "", null], "storage", { action: "y" });
  assert.deepEqual(events.docs.map(({ _id, ...d }) => d), [
    { recipientTz: "t1", type: "storage", payload: { action: "x" }, at },
    { recipientTz: "t2", type: "storage", payload: { action: "y" }, at },
    { recipientTz: "t3", type: "storage", payload: { action: "y" }, at },
  ]);
  await bus.publish("", "storage", {});
  assert.equal(events.docs.length, 3);
});

test("ensureIndexes passes index options (TTL) through, and the live collections expire", async () => {
  const made = [];
  await ensureIndexes({ createIndex: async (key, options) => made.push([key, options]) }, [
    { key: { a: 1 } },
    { key: { at: 1 }, options: { expireAfterSeconds: 5 } },
  ]);
  assert.deepEqual(made, [[{ a: 1 }, {}], [{ at: 1 }, { expireAfterSeconds: 5 }]]);
  const ttl = (list) => list.find((i) => i.options?.expireAfterSeconds)?.options.expireAfterSeconds;
  assert.equal(ttl(LIVE_TICKET_INDEXES), 60);
  assert.equal(ttl(LIVE_EVENT_INDEXES), 600);
  assert.ok(LIVE_EVENT_INDEXES.some((i) => i.key.recipientTz === 1 && i.key.at === 1));
});

/* ---------------- who hears about a storage change ---------------- */

const OWNER = { _id: "1".repeat(24), tz: "300000007", firstname: "Ow", lastname: "Ner", roles: ["مرشد"] };
const SHAREE = { _id: "2".repeat(24), tz: "400000005", firstname: "Sh", lastname: "Are", roles: ["مرشد"] };
const MANAGER = { _id: "3".repeat(24), tz: "500000003", firstname: "Ma", lastname: "Nager", roles: ["ادارة"] };
const OUTSIDER = { _id: "4".repeat(24), tz: "600000001", firstname: "Ou", lastname: "Tsider", roles: ["مرشد"] };
const SYSTEM = { _id: "5".repeat(24), tz: SYSTEM_TZ, firstname: "Sys", lastname: "Tem", roles: ["ادارة"] };
const PEOPLE = [OWNER, SHAREE, MANAGER, OUTSIDER, SYSTEM];

test("storage recipients: folder owner, people it is shared with, files.manageAll holders; never the system account", async () => {
  const entries = {
    [`users/${OWNER.tz}/docs`]: [{ ownerId: OWNER._id, sharedWith: [{ userId: SHAREE._id, role: "read" }, { userId: SYSTEM._id }] }],
  };
  const recipients = createStorageRecipients({
    listActiveUsers: async () => PEOPLE,
    findEntriesByPath: async (p) => entries[p] || [],
    folderCandidatesOf: (u) => [`users/${u.tz}`],
    systemTz: SYSTEM_TZ,
  });
  const sorted = (list) => [...list].sort();
  assert.deepEqual(sorted(await recipients([`users/${OWNER.tz}/docs/a.pdf`])), sorted([OWNER.tz, SHAREE.tz, MANAGER.tz]));
  assert.deepEqual(sorted(await recipients(["Trips/plan.pdf"])), [MANAGER.tz]);
  assert.deepEqual(sorted(await recipients(["Trips"], { extraTzs: [OUTSIDER.tz, SYSTEM_TZ, "nobody"] })), sorted([MANAGER.tz, OUTSIDER.tz]));
});

async function withSystemTz(fn) {
  const had = Object.hasOwn(process.env, "SYSTEM_ADMIN_TZ");
  const previous = process.env.SYSTEM_ADMIN_TZ;
  process.env.SYSTEM_ADMIN_TZ = SYSTEM_TZ;
  try { return await fn(); } finally { if (had) process.env.SYSTEM_ADMIN_TZ = previous; else delete process.env.SYSTEM_ADMIN_TZ; }
}

const ownerReq = (body) => ({ user: { tz: OWNER.tz, roles: OWNER.roles }, actor: actorFor(OWNER), body, params: {}, query: {} });
const createRes = () => ({ statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });

test("a storage rename is published only to the owner, the sharee and files.manageAll holders", async () => {
  await withSystemTz(async () => {
    const seed = [
      { type: "folder", name: "docs", relativePath: `tamheed_db/root/users/${OWNER.tz}/docs`, ownerId: OWNER._id,
        sharedWith: [{ userId: SHAREE._id, role: "read" }] },
      { type: "file", name: "a.pdf", relativePath: `tamheed_db/root/users/${OWNER.tz}/docs/a.pdf`, ownerId: OWNER._id, sharedWith: [] },
    ];
    const { controller, published } = loadStorageController(seed, { users: PEOPLE });
    const out = createRes();
    await controller.renameFile(ownerReq({ relativePath: "docs/a.pdf", newName: "b.pdf" }), out);
    assert.equal(out.statusCode, 200);
    assert.equal(published.length, 1);
    const [event] = published;
    assert.equal(event.type, "storage");
    assert.equal(event.payload.action, "file_renamed");
    assert.deepEqual([...event.tzs].sort(), [OWNER.tz, SHAREE.tz, MANAGER.tz].sort());
  });
});

test("a delete reaches the people who could see the entry before it was removed", async () => {
  await withSystemTz(async () => {
    const seed = [
      { type: "file", name: "a.pdf", relativePath: `tamheed_db/root/users/${OWNER.tz}/a.pdf`, ownerId: OWNER._id,
        sharedWith: [{ userId: SHAREE._id, role: "read" }] },
    ];
    const { controller, published } = loadStorageController(seed, { users: PEOPLE });
    const out = createRes();
    await controller.deleteEntry(ownerReq({ relativePath: "a.pdf" }), out);
    assert.equal(out.statusCode, 200);
    assert.equal(published.length, 1);
    assert.equal(published[0].payload.action, "entry_deleted");
    assert.deepEqual([...published[0].tzs].sort(), [OWNER.tz, SHAREE.tz, MANAGER.tz].sort());
  });
});

/* ---------------- AiAlerts on the stream ---------------- */

test("the stream also pushes the user's own unread AiAlerts as `alert` events, each once", async () => {
  const rows = [];
  const alerts = {
    async since(recipientTz, from, limit) {
      return rows.filter((r) => r.recipientTz === recipientTz && !r.readAt && new Date(r.at) >= new Date(from)).slice(0, limit);
    },
  };
  const text = { ar: "تنبيه", he: "התראה", en: "Alert" };
  rows.push({ _id: "a1", recipientTz: userA.tz, type: "report_missing", severity: "important", text, link: "/reports", dedupKey: "k1", readAt: null, at: new Date(1000) });
  rows.push({ _id: "a2", recipientTz: userB.tz, type: "report_missing", severity: "important", text, link: "/reports", dedupKey: "k2", readAt: null, at: new Date(1000) });
  rows.push({ _id: "a3", recipientTz: userA.tz, type: "report_missing", severity: "info", text, link: "/reports", dedupKey: "k3", readAt: new Date(2000), at: new Date(1000) });
  const { server, base } = await startApp({ users: { [userA.tz]: { ...userA }, [userB.tz]: { ...userB } }, options: { alerts } });
  try {
    const { body } = await getTicket(base, userA.tz);
    const res = await readStream(base, body.ticket, 120);
    const got = parseEvents(res.text).filter((e) => e.event === "alert");
    assert.deepEqual(got, [{ event: "alert", data: { id: "a1", type: "report_missing", severity: "important", text, link: "/reports", at: new Date(1000).toISOString() } }]);
  } finally { server.close(); }
});

test("the stream pushes only alert types the user may still see, re-read at each re-check", async () => {
  const rows = [];
  const alerts = {
    async since(recipientTz, from, limit) {
      return rows.filter((r) => r.recipientTz === recipientTz && !r.readAt && new Date(r.at) >= new Date(from)).slice(0, limit);
    },
  };
  const text = { ar: "تنبيه", he: "התראה", en: "Alert" };
  const clock = { now: Date.UTC(2026, 9, 20, 10, 0, 0) };
  const row = (id, type) => ({ _id: id, recipientTz: userA.tz, type, severity: "info", text, link: "/", dedupKey: id, readAt: null, at: new Date(clock.now) });
  rows.push(row("w1", "user_waiting"), row("r1", "report_missing"));
  const users = { [userA.tz]: { ...userA } };
  const { server, base } = await startApp({ users, clock, options: { alerts, recheckEveryPolls: 1 } });
  try {
    const { body } = await getTicket(base, userA.tz);
    // A guide (no users.approve) sees only their own report alert; once granted
    // users.approve, the next re-check lets the new waiting-room alert through.
    setTimeout(() => {
      users[userA.tz].permissionGrants = ["users.approve"];
      rows.push(row("w2", "user_waiting"));
    }, 60);
    const res = await readStream(base, body.ticket, 300);
    const ids = parseEvents(res.text).filter((e) => e.event === "alert").map((e) => e.data.id);
    assert.deepEqual(ids, ["r1", "w2"]);
  } finally { server.close(); }
});

/* ---------------- shutdown, payloads, reads (final-review fixes) ---------------- */

// Loaded lazily so the rest of the file runs while the helper is missing.
const createFatalShutdown = (opts) => require("../utils/fatalShutdown").createFatalShutdown(opts);

test("endAllStreams ends every open live stream", async () => {
  const { server, base, router } = await startApp({ users: { [userA.tz]: { ...userA } } });
  try {
    const { body } = await getTicket(base, userA.tz);
    setTimeout(() => router.endAllStreams(), 60);
    const res = await readStream(base, body.ticket, 2000);
    assert.equal(res.ended, true, "stream still open");
  } finally { server.closeAllConnections(); server.close(); }
});

test("the fatal shutdown exits even while a live stream is open", async () => {
  const { server, base, router } = await startApp({ users: { [userA.tz]: { ...userA } } });
  const exits = [];
  const timers = [];
  const shutdown = createFatalShutdown({
    server,
    endStreams: () => router.endAllStreams(),
    exit: (code) => exits.push(code),
    setTimer: (fn, ms) => { const t = { fn, ms, unref() { this.unrefed = true; } }; timers.push(t); return t; },
  });
  try {
  const { body } = await getTicket(base, userA.tz);
  const reading = readStream(base, body.ticket, 3000);
  await new Promise((resolve) => setTimeout(resolve, 60));
  shutdown();
  shutdown(); // a second fatal error does not start a second shutdown
  await reading;
  for (let i = 0; i < 50 && !exits.length; i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(exits, [1], "server.close never finished");
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 5000);
  assert.equal(timers[0].unrefed, true, "the hard-exit timer must not keep the process alive");
  } finally { server.closeAllConnections(); server.close(); }
});

test("the fatal shutdown's hard timer exits when the server never finishes closing", () => {
  const exits = [];
  let hard;
  const shutdown = createFatalShutdown({
    server: { close() {}, closeAllConnections() {} },
    exit: (code) => exits.push(code),
    setTimer: (fn, ms) => { hard = { fn, ms }; return { unref() {} }; },
  });
  shutdown();
  assert.deepEqual(exits, []);
  hard.fn();
  assert.deepEqual(exits, [1]);
});

test("server.js uses the fatal shutdown for unhandled rejections", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(source, /createFatalShutdown/);
  assert.doesNotMatch(source, /httpServer\.close\(\(\) => process\.exit\(1\)\)/);
});

test("a storage live event carries only module, action and ts (no tz, no path)", async () => {
  await withSystemTz(async () => {
    const seed = [
      { type: "folder", name: "docs", relativePath: `tamheed_db/root/users/${OWNER.tz}/docs`, ownerId: OWNER._id, sharedWith: [] },
      { type: "file", name: "a.pdf", relativePath: `tamheed_db/root/users/${OWNER.tz}/docs/a.pdf`, ownerId: OWNER._id, sharedWith: [] },
    ];
    const { controller, published } = loadStorageController(seed, { users: PEOPLE });
    await controller.shareEntry(ownerReq({ relativePath: "docs/a.pdf", targetTz: SHAREE.tz, role: "read" }), createRes());
    await controller.unshareEntry(ownerReq({ relativePath: "docs/a.pdf", targetTz: SHAREE.tz }), createRes());
    await controller.renameFile(ownerReq({ relativePath: "docs/a.pdf", newName: "b.pdf" }), createRes());
    assert.deepEqual(published.map((p) => p.payload.action), ["entry_shared", "entry_unshared", "file_renamed"]);
    for (const { payload } of published) {
      assert.deepEqual(Object.keys(payload).sort(), ["action", "module", "ts"]);
      assert.equal(payload.module, "storage");
    }
    // The share still reaches the new sharee.
    assert.ok(published[0].tzs.includes(SHAREE.tz));
  });
});

test("LiveEvent.since reads with readSorted (no count on every poll)", async () => {
  const api = require("../Entities/api");
  const { LiveEventModelDef } = require("../Entities/Live/LiveEvent.model");
  const original = { readSorted: api.readSorted, readPage: api.readPage };
  const calls = [];
  api.readSorted = async (args) => { calls.push(args); return { success: true, result: [{ _id: "x" }] }; };
  api.readPage = async () => { throw new Error("readPage counts every match"); };
  try {
    const from = new Date(5000);
    assert.deepEqual(await LiveEventModelDef.since("t-1", from, 7), [{ _id: "x" }]);
    assert.deepEqual(calls[0].filter, { recipientTz: "t-1", at: { $gte: from } });
    assert.deepEqual(calls[0].sort, { at: 1, _id: 1 });
    assert.equal(calls[0].limit, 7);
  } finally { Object.assign(api, original); }
});
