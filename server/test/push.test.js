const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const cookieParser = require("cookie-parser");

process.env.PASSWORD_ENC_KEY_HEX = process.env.PASSWORD_ENC_KEY_HEX || "0".repeat(64);
process.env.SPORT_SESSION_SECRET = "test-sport-session-secret";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

const { createPush } = require("../utils/push");
const { createPushRouter, createSportSubscribeRouter } = require("../Entities/Push/Push.route");
const { PushSubscriptionModelDef, PUSH_SUBSCRIPTION_INDEXES } = require("../Entities/Push/PushSubscription.model");

const ENV = { VAPID_PUBLIC_KEY: "pub-key", VAPID_PRIVATE_KEY: "priv-key", VAPID_SUBJECT: "mailto:ops@example.com" };
const sub = (n, extra) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${n}`, keys: { p256dh: `p${n}`, auth: `a${n}` }, ...extra });

// In-memory subscription store with the same surface as the model.
function memoryStore(rows = []) {
  const docs = rows.map((r) => ({ ...r }));
  return {
    docs,
    async listStaff(tzs) { return docs.filter((d) => d.kind === "staff" && tzs.includes(d.tz)).map((d) => ({ ...d })); },
    async listStudents(ids) { return docs.filter((d) => d.kind === "sport" && ids.includes(d.studentId)).map((d) => ({ ...d })); },
    async upsert(doc) {
      const i = docs.findIndex((d) => d.endpoint === doc.endpoint);
      if (i >= 0) docs[i] = { ...docs[i], ...doc };
      else docs.push({ ...doc });
    },
    async trimOwner(owner, max) {
      const mine = docs.filter((d) => (owner.kind === "staff" ? d.kind === "staff" && d.tz === owner.tz : d.kind === "sport" && d.studentId === owner.studentId));
      mine.sort((a, b) => a.createdAt - b.createdAt).slice(0, Math.max(0, mine.length - max)).forEach((d) => docs.splice(docs.indexOf(d), 1));
    },
    async remove(endpoint, owner) {
      for (let i = docs.length - 1; i >= 0; i -= 1) {
        const d = docs[i];
        if (d.endpoint !== endpoint) continue;
        if (owner?.tz && d.tz !== owner.tz) continue;
        if (owner?.studentId && d.studentId !== owner.studentId) continue;
        docs.splice(i, 1);
      }
    },
  };
}

function stubWebpush(failures = {}) {
  const calls = [];
  return {
    calls,
    async sendNotification(subscription, payload, options) {
      calls.push({ endpoint: subscription.endpoint, payload, options });
      if (failures[subscription.endpoint]) throw Object.assign(new Error("gone"), { statusCode: failures[subscription.endpoint] });
      return { statusCode: 201 };
    },
  };
}

test("sendToStaff sends only to that tz, to every one of its devices", async () => {
  const webpush = stubWebpush();
  const subscriptions = memoryStore([
    { kind: "staff", tz: "111", ...sub(1) }, { kind: "staff", tz: "111", ...sub(2) },
    { kind: "staff", tz: "222", ...sub(3) }, { kind: "sport", studentId: "111", ...sub(4) },
  ]);
  const push = createPush({ webpush, subscriptions, env: ENV });
  const payload = { title: "t", body: "b", url: "/x" };
  const result = await push.sendToStaff(["111"], payload);
  assert.deepEqual(result, { sent: 2, removed: 0 });
  assert.deepEqual(webpush.calls.map((c) => c.endpoint).sort(), ["https://fcm.googleapis.com/fcm/send/1", "https://fcm.googleapis.com/fcm/send/2"]);
  assert.equal(webpush.calls[0].payload, JSON.stringify(payload));
});

test("sendToStudents sends only to sport subscriptions of those students", async () => {
  const webpush = stubWebpush();
  const subscriptions = memoryStore([
    { kind: "sport", studentId: "s1", ...sub(1) }, { kind: "sport", studentId: "s2", ...sub(2) },
    { kind: "staff", tz: "s1", ...sub(3) },
  ]);
  const push = createPush({ webpush, subscriptions, env: ENV });
  assert.deepEqual(await push.sendToStudents(["s1"], { title: "t", body: "b", url: "/" }), { sent: 1, removed: 0 });
  assert.deepEqual(webpush.calls.map((c) => c.endpoint), ["https://fcm.googleapis.com/fcm/send/1"]);
});

test("a 410 or 404 removes that subscription, the others still get the push", async () => {
  for (const code of [410, 404]) {
    const webpush = stubWebpush({ "https://fcm.googleapis.com/fcm/send/1": code });
    const subscriptions = memoryStore([{ kind: "staff", tz: "111", ...sub(1) }, { kind: "staff", tz: "111", ...sub(2) }]);
    const push = createPush({ webpush, subscriptions, env: ENV });
    assert.deepEqual(await push.sendToStaff(["111"], { title: "t", body: "b", url: "/" }), { sent: 1, removed: 1 });
    assert.deepEqual(subscriptions.docs.map((d) => d.endpoint), ["https://fcm.googleapis.com/fcm/send/2"]);
    assert.equal(webpush.calls.length, 2);
  }
});

test("other failures keep the subscription and are not counted as sent", async () => {
  const webpush = stubWebpush({ "https://fcm.googleapis.com/fcm/send/1": 500 });
  const subscriptions = memoryStore([{ kind: "staff", tz: "111", ...sub(1) }]);
  const push = createPush({ webpush, subscriptions, env: ENV });
  assert.deepEqual(await push.sendToStaff(["111"], { title: "t", body: "b", url: "/" }), { sent: 0, removed: 0 });
  assert.equal(subscriptions.docs.length, 1);
});

test("with no VAPID keys every send is a no-op and webpush is never called", async () => {
  const webpush = stubWebpush();
  const subscriptions = memoryStore([{ kind: "staff", tz: "111", ...sub(1) }, { kind: "sport", studentId: "s1", ...sub(2) }]);
  const push = createPush({ webpush, subscriptions, env: {} });
  assert.equal(await push.publicKey(), null);
  assert.deepEqual(await push.sendToStaff(["111"], { title: "t", body: "b", url: "/" }), { sent: 0, removed: 0 });
  assert.deepEqual(await push.sendToStudents(["s1"], { title: "t", body: "b", url: "/" }), { sent: 0, removed: 0 });
  assert.equal(webpush.calls.length, 0);
});

test("the model is unique by endpoint", () => {
  assert.deepEqual(PUSH_SUBSCRIPTION_INDEXES, [{ key: { endpoint: 1 }, options: { unique: true } }]);
  assert.equal(PushSubscriptionModelDef.collections.active, "PushSubscriptions");
});

async function serve(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}
const post = (url, body, headers = {}) => fetch(url, {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
});
const del = (url, body, headers = {}) => fetch(url, {
  method: "DELETE", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
});

function staffApp(store, push) {
  const requireAuth = (req, res, next) => {
    const tz = req.headers["x-tz"];
    if (!tz) return res.status(401).json({ code: "NO_TOKEN" });
    req.user = { tz };
    return next();
  };
  const loadActor = (req, res, next) => { req.actor = { tz: req.user.tz }; next(); };
  const app = express();
  app.use(express.json());
  const requirePermission = (key) => (req, res, next) => (req.headers["x-perm"] === key ? next() : res.status(403).json({ code: "FORBIDDEN" }));
  app.use("/api/push", createPushRouter({ requireAuth, loadActor, requirePermission, store, push }));
  return app;
}

test("GET /api/push/key is public and returns the env public key", async () => {
  const push = createPush({ webpush: stubWebpush(), subscriptions: memoryStore(), env: ENV });
  const { server, base } = await serve(staffApp(memoryStore(), push));
  try {
    const res = await fetch(`${base}/api/push/key`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, key: "pub-key" });
  } finally { server.close(); }
});

test("staff subscribe: 401 without a token; twice with the same endpoint keeps one row; delete removes it", async () => {
  const store = memoryStore();
  const push = createPush({ webpush: stubWebpush(), subscriptions: store, env: ENV });
  const { server, base } = await serve(staffApp(store, push));
  try {
    const url = `${base}/api/push/subscribe`;
    assert.equal((await post(url, { subscription: sub(1) })).status, 401);
    const headers = { "x-tz": "111" };
    assert.equal((await post(url, { subscription: sub(1) }, headers)).status, 200);
    assert.equal((await post(url, { subscription: sub(1) }, headers)).status, 200);
    assert.equal(store.docs.length, 1);
    assert.equal(store.docs[0].kind, "staff");
    assert.equal(store.docs[0].tz, "111");
    assert.equal((await post(url, { subscription: { endpoint: "x" } }, headers)).status, 400);
    assert.equal((await del(url, { subscription: sub(1) })).status, 401);
    await del(url, { subscription: sub(1) }, { "x-tz": "222" });
    assert.equal(store.docs.length, 1);
    assert.equal((await del(url, { subscription: sub(1) }, headers)).status, 200);
    assert.equal(store.docs.length, 0);
  } finally { server.close(); }
});

test("sport subscribe: 401 without the sport cookie; a signed-in student subscribes and unsubscribes", async () => {
  const store = memoryStore();
  const requireSportStudent = (req, res, next) => {
    if (req.cookies?.sport !== "ok") return res.status(401).json({ ok: false, code: "SPORT_AUTH" });
    req.sportStudent = { _id: "s1" };
    return next();
  };
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/sport-portal/push", createSportSubscribeRouter({ requireSportStudent, store }));
  const { server, base } = await serve(app);
  try {
    const url = `${base}/api/sport-portal/push/subscribe`;
    assert.equal((await post(url, { subscription: sub(1) })).status, 401);
    assert.equal((await post(url, { subscription: sub(1) }, { cookie: "sport=ok" })).status, 200);
    assert.deepEqual([store.docs[0].kind, store.docs[0].studentId], ["sport", "s1"]);
    assert.equal((await del(url, { subscription: sub(1) }, { cookie: "sport=ok" })).status, 200);
    assert.equal(store.docs.length, 0);
  } finally { server.close(); }
});

test("the real sport router answers 401 on the subscribe routes without the cookie", async () => {
  const router = require("../Entities/SportPortal/SportPortal.route");
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/sport-portal", router);
  const { server, base } = await serve(app);
  try {
    assert.equal((await post(`${base}/api/sport-portal/push/subscribe`, { subscription: sub(1) })).status, 401);
    assert.equal((await del(`${base}/api/sport-portal/push/subscribe`, { subscription: sub(1) })).status, 401);
  } finally { server.close(); }
});

test("only real push-service endpoints are accepted; everything else is 400", async () => {
  const store = memoryStore();
  const push = createPush({ webpush: stubWebpush(), subscriptions: store, env: ENV });
  const { server, base } = await serve(staffApp(store, push));
  try {
    const url = `${base}/api/push/subscribe`;
    const headers = { "x-tz": "111" };
    const keys = { p256dh: "p", auth: "a" };
    for (const endpoint of [
      "https://127.0.0.1/x", "https://localhost/x", "https://evil.example.com/x",
      "https://fcm.googleapis.com.evil.com/x", "https://evilfcm.googleapis.com/x", "https://push.services.mozilla.com/x",
      "https://fcm.googleapis.com@evil.com/x", "http://fcm.googleapis.com/x", "https://x.notify.windows.com.evil.com/x",
      "https://fcm.googleapis.com:8443/x", "not a url",
    ]) {
      assert.equal((await post(url, { subscription: { endpoint, keys } }, headers)).status, 400, endpoint);
    }
    assert.equal(store.docs.length, 0);
    for (const endpoint of [
      "https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://db5p.notify.windows.com/w/?token=abc", "https://web.push.apple.com/abc", "https://x.push.apple.com/abc",
    ]) {
      assert.equal((await post(url, { subscription: { endpoint, keys } }, headers)).status, 200, endpoint);
    }
  } finally { server.close(); }
});

test("length limits answer 400; a missing actor tz answers 401", async () => {
  const store = memoryStore();
  const push = createPush({ webpush: stubWebpush(), subscriptions: store, env: ENV });
  const app = staffApp(store, push);
  const { server, base } = await serve(app);
  try {
    const url = `${base}/api/push/subscribe`;
    const headers = { "x-tz": "111" };
    const ok = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "p", auth: "a" } };
    const longEndpoint = `https://fcm.googleapis.com/${"a".repeat(1000)}`;
    assert.equal((await post(url, { subscription: { ...ok, endpoint: longEndpoint } }, headers)).status, 400);
    assert.equal((await post(url, { subscription: { ...ok, keys: { p256dh: "p".repeat(201), auth: "a" } } }, headers)).status, 400);
    assert.equal((await post(url, { subscription: { ...ok, keys: { p256dh: "p", auth: "a".repeat(201) } } }, headers)).status, 400);
    assert.equal((await post(url, { subscription: ok }, headers)).status, 200);
  } finally { server.close(); }
  const noTz = express();
  noTz.use(express.json());
  noTz.use("/api/push", createPushRouter({
    requireAuth: (req, res, next) => { req.user = {}; next(); },
    loadActor: (req, res, next) => { req.actor = {}; next(); },
    requirePermission: () => (req, res, next) => next(),
    store, push,
  }));
  const second = await serve(noTz);
  try {
    assert.equal((await post(`${second.base}/api/push/subscribe`, { subscription: sub(2) })).status, 401);
    assert.equal((await del(`${second.base}/api/push/subscribe`, { subscription: sub(2) })).status, 401);
  } finally { second.server.close(); }
});

test("an owner keeps at most 10 subscriptions: the 11th removes the oldest", async () => {
  const store = memoryStore();
  const push = createPush({ webpush: stubWebpush(), subscriptions: store, env: ENV });
  const { server, base } = await serve(staffApp(store, push));
  try {
    for (let n = 1; n <= 11; n += 1) {
      assert.equal((await post(`${base}/api/push/subscribe`, { subscription: sub(n) }, { "x-tz": "111" })).status, 200);
      await new Promise((r) => setTimeout(r, 3));
    }
    const ends = store.docs.map((d) => d.endpoint);
    assert.equal(ends.length, 10);
    assert.ok(!ends.includes(sub(1).endpoint));
    assert.ok(ends.includes(sub(11).endpoint));
  } finally { server.close(); }
});

test("a failed send is logged once with status and host only", async () => {
  const webpush = stubWebpush({ "https://fcm.googleapis.com/fcm/send/1": 500, "https://fcm.googleapis.com/fcm/send/2": 429 });
  const subscriptions = memoryStore([{ kind: "staff", tz: "111", ...sub(1) }, { kind: "staff", tz: "111", ...sub(2) }]);
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(" "));
  try {
    await createPush({ webpush, subscriptions, env: ENV }).sendToStaff(["111"], { title: "t", body: "b", url: "/" });
  } finally { console.log = original; }
  assert.equal(lines.length, 1);
  assert.match(lines[0], /500@fcm.googleapis.com/);
  assert.match(lines[0], /429@fcm.googleapis.com/);
  assert.ok(!lines[0].includes("/fcm/send/") && !lines[0].includes("p1"));
});

// The admin switch: one row, keys made on the first switch-on when the
// environment has none.
function memorySettings(row = null) {
  const box = { row, reads: 0 };
  return Object.assign(box, {
    async read() { box.reads += 1; return box.row && { ...box.row }; },
    async write(data) { box.row = { ...(box.row || {}), ...data }; },
  });
}
const keyMaker = () => {
  let n = 0;
  return Object.assign(stubWebpush(), { generateVAPIDKeys: () => { n += 1; return { publicKey: `made-pub-${n}`, privateKey: `made-priv-${n}` }; } });
};

test("no keys and no row: off; switching on makes keys once, off keeps them, on again reuses them", async () => {
  const webpush = keyMaker();
  const settings = memorySettings();
  const subscriptions = memoryStore([{ kind: "staff", tz: "111", ...sub(1) }]);
  const push = createPush({ webpush, subscriptions, settings, env: {} });
  assert.deepEqual(await push.status(), { enabled: false, keysFrom: "none" });
  assert.equal(await push.publicKey(), null);

  assert.deepEqual(await push.setEnabled(true, { subject: "https://example.org", by: "900" }), { enabled: true, keysFrom: "server" });
  assert.equal(await push.publicKey(), "made-pub-1");
  assert.equal(settings.row.updatedBy, "900");
  await push.sendToStaff(["111"], { title: "t", body: "b", url: "/" });
  assert.deepEqual(webpush.calls[0].options.vapidDetails, { subject: "https://example.org", publicKey: "made-pub-1", privateKey: "made-priv-1" });

  assert.deepEqual(await push.setEnabled(false), { enabled: false, keysFrom: "server" });
  assert.equal(await push.publicKey(), null);
  assert.deepEqual(await push.sendToStaff(["111"], { title: "t", body: "b", url: "/" }), { sent: 0, removed: 0 });
  assert.equal(webpush.calls.length, 1);

  await push.setEnabled(true, { subject: "https://other.org" });
  assert.equal(await push.publicKey(), "made-pub-1");
  assert.equal(settings.row.subject, "https://example.org");
});

test("keys in the environment: on with no row, the switch turns them off and on, nothing is stored", async () => {
  const webpush = keyMaker();
  const settings = memorySettings();
  const push = createPush({ webpush, subscriptions: memoryStore(), settings, env: ENV });
  assert.deepEqual(await push.status(), { enabled: true, keysFrom: "env" });
  assert.equal(await push.publicKey(), "pub-key");
  await push.setEnabled(false);
  assert.equal(await push.publicKey(), null);
  assert.equal(settings.row.privateKey, undefined);
  await push.setEnabled(true);
  assert.equal(await push.publicKey(), "pub-key");
  assert.equal(settings.row.privateKey, undefined);
});

test("another process's switch is read again after 30 seconds; a failed read means off", async () => {
  let clock = 0;
  const settings = memorySettings({ enabled: true, publicKey: "p", privateKey: "k", subject: "https://x.org" });
  const push = createPush({ webpush: keyMaker(), subscriptions: memoryStore(), settings, env: {}, now: () => clock });
  assert.equal(await push.publicKey(), "p");
  settings.row.enabled = false;
  clock = 29 * 1000;
  assert.equal(await push.publicKey(), "p");
  clock = 31 * 1000;
  assert.equal(await push.publicKey(), null);

  const broken = createPush({ webpush: keyMaker(), subscriptions: memoryStore(), settings: { read: async () => { throw new Error("db down"); } }, env: ENV });
  assert.equal(await broken.publicKey(), null);
});

test("GET/PUT /api/push/settings: permissions.manage only, a boolean only, never the keys", async () => {
  const settings = memorySettings();
  const push = createPush({ webpush: keyMaker(), subscriptions: memoryStore(), settings, env: {} });
  const { server, base } = await serve(staffApp(memoryStore(), push));
  const put = (body, headers) => fetch(`${base}/api/push/settings`, { method: "PUT", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  const admin = { "x-tz": "900", "x-perm": "permissions.manage" };
  try {
    assert.equal((await fetch(`${base}/api/push/settings`)).status, 401);
    assert.equal((await fetch(`${base}/api/push/settings`, { headers: { "x-tz": "111" } })).status, 403);
    assert.equal((await put({ enabled: true }, { "x-tz": "111" })).status, 403);
    assert.equal(settings.row, null);
    assert.equal((await put({ enabled: "yes" }, admin)).status, 400);

    const on = await put({ enabled: true }, admin);
    assert.equal(on.status, 200);
    const text = await on.text();
    assert.deepEqual(JSON.parse(text), { ok: true, enabled: true, keysFrom: "server" });
    assert.ok(!text.includes("made-priv") && !text.includes("made-pub"));
    assert.equal(settings.row.subject, base.replace("http://", "https://"));
    assert.deepEqual(await (await fetch(`${base}/api/push/settings`, { headers: admin })).json(), { ok: true, enabled: true, keysFrom: "server" });
    const key = await fetch(`${base}/api/push/key`);
    assert.equal(key.headers.get("cache-control"), "no-store");
    assert.deepEqual(await key.json(), { ok: true, key: "made-pub-1" });
  } finally { server.close(); }
});

test("two first switch-ons at once make one key pair", async () => {
  const webpush = keyMaker();
  const settings = memorySettings();
  const slowRead = settings.read;
  settings.read = async () => { await new Promise((r) => setTimeout(r, 5)); return slowRead(); };
  const push = createPush({ webpush, subscriptions: memoryStore(), settings, env: {} });
  await Promise.all([push.setEnabled(true, { subject: "https://a.org" }), push.setEnabled(true, { subject: "https://a.org" })]);
  assert.equal(settings.row.publicKey, "made-pub-1");
  assert.equal(await push.publicKey(), "made-pub-1");
});

test("a read that started before a switch-off does not bring the old state back", async () => {
  const settings = memorySettings({ enabled: true, publicKey: "p", privateKey: "k", subject: "https://x.org" });
  const plainRead = settings.read;
  let release;
  settings.read = async () => {
    const row = await plainRead();
    if (release === undefined) await new Promise((r) => { release = r; });
    return row;
  };
  const push = createPush({ webpush: keyMaker(), subscriptions: memoryStore(), settings, env: {} });
  const early = push.publicKey(); // stalls holding enabled: true
  await new Promise((r) => setImmediate(r));
  await push.setEnabled(false);
  release();
  assert.equal(await early, "p");
  assert.equal(await push.publicKey(), null);
});
