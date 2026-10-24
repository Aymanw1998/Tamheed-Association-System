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
const sub = (n, extra) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: `p${n}`, auth: `a${n}` }, ...extra });

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
  assert.deepEqual(webpush.calls.map((c) => c.endpoint).sort(), ["https://push.example/1", "https://push.example/2"]);
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
  assert.deepEqual(webpush.calls.map((c) => c.endpoint), ["https://push.example/1"]);
});

test("a 410 or 404 removes that subscription, the others still get the push", async () => {
  for (const code of [410, 404]) {
    const webpush = stubWebpush({ "https://push.example/1": code });
    const subscriptions = memoryStore([{ kind: "staff", tz: "111", ...sub(1) }, { kind: "staff", tz: "111", ...sub(2) }]);
    const push = createPush({ webpush, subscriptions, env: ENV });
    assert.deepEqual(await push.sendToStaff(["111"], { title: "t", body: "b", url: "/" }), { sent: 1, removed: 1 });
    assert.deepEqual(subscriptions.docs.map((d) => d.endpoint), ["https://push.example/2"]);
    assert.equal(webpush.calls.length, 2);
  }
});

test("other failures keep the subscription and are not counted as sent", async () => {
  const webpush = stubWebpush({ "https://push.example/1": 500 });
  const subscriptions = memoryStore([{ kind: "staff", tz: "111", ...sub(1) }]);
  const push = createPush({ webpush, subscriptions, env: ENV });
  assert.deepEqual(await push.sendToStaff(["111"], { title: "t", body: "b", url: "/" }), { sent: 0, removed: 0 });
  assert.equal(subscriptions.docs.length, 1);
});

test("with no VAPID keys every send is a no-op and webpush is never called", async () => {
  const webpush = stubWebpush();
  const subscriptions = memoryStore([{ kind: "staff", tz: "111", ...sub(1) }, { kind: "sport", studentId: "s1", ...sub(2) }]);
  const push = createPush({ webpush, subscriptions, env: {} });
  assert.equal(push.publicKey(), null);
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
  app.use("/api/push", createPushRouter({ requireAuth, loadActor, store, push }));
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
