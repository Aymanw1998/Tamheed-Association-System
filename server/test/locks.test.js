const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");

const { createLocks } = require("../services/locks");
const { createLockRouter } = require("../Entities/Lock/Lock.route");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { actorFor } = require("./helpers/actors");

const ADMIN = "ادارة";
const GUIDE = "مرشد";
const ADMIN_U = { _id: "a".repeat(24), tz: "t-admin", firstname: "Ad", lastname: "Min", role: ADMIN, roles: [ADMIN], permissionGrants: ["permissions.manage", "sports.manage"] };
const GUIDE_U = { _id: "b".repeat(24), tz: "t-guide", firstname: "Gu", lastname: "Ide", role: GUIDE, roles: [GUIDE] };
const USERS = { [ADMIN_U.tz]: ADMIN_U, [GUIDE_U.tz]: GUIDE_U };

// Stub collection with a unique `key`: a conditional upsert that does not match
// an existing key throws E11000, like MongoDB. A tick between the check and the
// write lets two concurrent acquires both reach it.
function lockModel() {
  const rows = new Map();
  const matchesCond = (row, cond) => Object.entries(cond).every(([field, expected]) => {
    if (field === "$or") return expected.some((c) => matchesCond(row, c));
    if (expected && typeof expected === "object" && "$lt" in expected) return new Date(row[field]) < expected.$lt;
    return row[field] === expected;
  });
  return {
    rows,
    async get({ key }) { return { success: true, result: rows.has(key) ? [{ ...rows.get(key) }] : [] }; },
    async acquire(filter, data) {
      await new Promise((resolve) => setImmediate(resolve));
      const existing = rows.get(filter.key);
      if (existing && !matchesCond(existing, filter)) {
        const error = new Error("E11000 duplicate key");
        error.code = 11000;
        throw error;
      }
      const row = { ...(existing || {}), ...data };
      rows.set(filter.key, row);
      return { success: true, result: { ...row } };
    },
    async updateExisting(filter, data) {
      const row = rows.get(filter.key);
      if (!row || row.clientId !== filter.clientId) return { success: true, result: null };
      Object.assign(row, data);
      return { success: true, result: { ...row } };
    },
    async delete(filter) {
      const row = rows.get(filter.key);
      const hit = row && (filter.clientId === undefined || row.clientId === filter.clientId);
      if (hit) rows.delete(filter.key);
      return { success: true, result: { deletedCount: hit ? 1 : 0 } };
    },
  };
}

function setup() {
  const clock = { now: Date.parse("2026-10-25T10:00:00Z") };
  const events = [];
  const model = lockModel();
  const hub = { broadcastStaff: (type, payload) => events.push({ type, payload }) };
  const locks = createLocks({ model, hub, now: () => clock.now });
  return { clock, events, model, locks };
}

const A = { clientId: "tab-a", userId: "1", tz: "t-a", name: "Aa Aa" };
const B = { clientId: "tab-b", userId: "2", tz: "t-b", name: "Bb Bb" };

/* ---------------- service ---------------- */

test("B cannot take a lock A holds, and never overwrites it", async () => {
  const { locks, model } = setup();
  assert.equal((await locks.acquire("student:1", A)).ok, true);
  const second = await locks.acquire("student:1", B);
  assert.deepEqual(second, { ok: false, holder: { name: "Aa Aa", tz: "t-a" } });
  assert.equal(model.rows.get("student:1").clientId, "tab-a");
});

test("A re-acquiring refreshes its own lock", async () => {
  const { locks, clock, model } = setup();
  await locks.acquire("student:1", A);
  clock.now += 60 * 1000;
  assert.equal((await locks.acquire("student:1", A)).ok, true);
  assert.equal(model.rows.get("student:1").expiresAt.getTime(), clock.now + 120 * 1000);
});

test("two concurrent acquires give exactly one winner", async () => {
  const { locks } = setup();
  const results = await Promise.all([locks.acquire("lesson:9", A), locks.acquire("lesson:9", B)]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  const loser = results.find((r) => !r.ok);
  assert.ok(loser.holder.name);
});

test("heartbeats keep the lock alive; without them it expires after 120 s", async () => {
  const { locks, clock } = setup();
  await locks.acquire("student:1", A);
  for (let i = 0; i < 6; i += 1) {
    clock.now += 20 * 1000;
    assert.equal(await locks.heartbeat("student:1", "tab-a"), true);
  }
  assert.equal((await locks.acquire("student:1", B)).ok, false);
  assert.deepEqual(await locks.holderOf("student:1", "tab-b"), { name: "Aa Aa", tz: "t-a" });
  clock.now += 121 * 1000;
  assert.equal(await locks.holderOf("student:1", "tab-b"), null);
  assert.equal((await locks.acquire("student:1", B)).ok, true);
  assert.equal(await locks.heartbeat("student:1", "tab-a"), false);
});

test("holderOf is null when free or held by this tab", async () => {
  const { locks } = setup();
  assert.equal(await locks.holderOf("student:1", "tab-a"), null);
  await locks.acquire("student:1", A);
  assert.equal(await locks.holderOf("student:1", "tab-a"), null);
});

test("heartbeat after force-release is false", async () => {
  const { locks } = setup();
  await locks.acquire("student:1", A);
  assert.equal(await locks.forceRelease("student:1"), true);
  assert.equal(await locks.heartbeat("student:1", "tab-a"), false);
});

test("release by a non-owner is a no-op; by the owner frees the item", async () => {
  const { locks, events } = setup();
  await locks.acquire("student:1", A);
  events.length = 0;
  await locks.release("student:1", "tab-b");
  assert.equal(await locks.heartbeat("student:1", "tab-a"), true);
  assert.deepEqual(events, []);
  await locks.release("student:1", "tab-a");
  assert.equal(await locks.heartbeat("student:1", "tab-a"), false);
  assert.deepEqual(events, [{ type: "lock", payload: { key: "student:1" } }]);
});

test("lock events are broadcast on acquire, release and force-release", async () => {
  const { locks, events } = setup();
  await locks.acquire("vehicle:5", A);
  await locks.release("vehicle:5", "tab-a");
  await locks.acquire("vehicle:5", B);
  await locks.forceRelease("vehicle:5");
  assert.deepEqual(events, Array(4).fill({ type: "lock", payload: { key: "vehicle:5" } }));
});

test("a failed acquire does not broadcast", async () => {
  const { locks, events } = setup();
  await locks.acquire("student:1", A);
  events.length = 0;
  await locks.acquire("student:1", B);
  assert.deepEqual(events, []);
});

/* ---------------- routes ---------------- */

// reports: the stand-in for ReportModelDef the report lock rules read.
async function startApp({ reports = { get: async () => ({ result: [] }) } } = {}) {
  const ctx = setup();
  const requireAuth = (req, res, next) => {
    const bearer = (req.headers.authorization || "").replace(/^Bearer /, "");
    const tz = req.headers["x-tz"] || bearer;
    if (!tz) return res.status(401).json({ code: "NO_TOKEN" });
    if (!USERS[tz]) return res.status(401).json({ code: "TOKEN_INVALID" });
    req.user = { tz };
    return next();
  };
  const loadActor = (req, res, next) => { req.actor = actorFor(USERS[req.user.tz]); next(); };
  const app = express();
  app.use(express.json());
  app.use("/api/locks", createLockRouter({ requireAuth, loadActor, requirePermission, locks: ctx.locks, reports }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { tz, client, body } = {}) => {
    const headers = { "content-type": "application/json" };
    if (tz) headers["x-tz"] = tz;
    if (client) headers["x-client-id"] = client;
    const res = await fetch(`${base}/api/locks${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json() };
  };
  return { ...ctx, server, call, base };
}

test("routes: acquire, locked by another tab (even the same user), release", async () => {
  const { server, call } = await startApp();
  try {
    const key = { key: "student:77" };
    const first = await call("POST", "/acquire", { tz: GUIDE_U.tz, client: "tab-1", body: key });
    assert.equal(first.status, 200);
    assert.equal(first.body.ok, true);
    const same = await call("POST", "/acquire", { tz: GUIDE_U.tz, client: "tab-2", body: key });
    assert.equal(same.status, 423);
    assert.deepEqual(same.body, { ok: false, code: "LOCKED", holder: { name: "Gu Ide", tz: GUIDE_U.tz }, message: `هذا العنصر مفتوح الآن لدى Gu Ide (${GUIDE_U.tz})` });
    const view = await call("GET", `/${encodeURIComponent("student:77")}`, { tz: ADMIN_U.tz, client: "tab-3" });
    assert.deepEqual(view.body, { ok: true, holder: { name: "Gu Ide", tz: GUIDE_U.tz } });
    const own = await call("GET", "/student:77", { tz: GUIDE_U.tz, client: "tab-1" });
    assert.deepEqual(own.body, { ok: true, holder: null });
    assert.equal((await call("POST", "/release", { tz: GUIDE_U.tz, client: "tab-1", body: key })).status, 200);
    assert.equal((await call("POST", "/acquire", { tz: ADMIN_U.tz, client: "tab-3", body: key })).status, 200);
  } finally { server.close(); }
});

test("routes: release accepts the client id and token from the body (sendBeacon)", async () => {
  const { server, call, base } = await startApp();
  try {
    const key = { key: "student:78" };
    assert.equal((await call("POST", "/acquire", { tz: GUIDE_U.tz, client: "tab-1", body: key })).status, 200);
    const res = await fetch(`${base}/api/locks/release`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...key, clientId: "tab-1", token: GUIDE_U.tz }),
    });
    assert.equal(res.status, 200);
    assert.equal((await call("POST", "/acquire", { tz: ADMIN_U.tz, client: "tab-2", body: key })).status, 200);
  } finally { server.close(); }
});

test("routes: a beacon release with a bad token is 401 and a non-owner client id leaves the lock held", async () => {
  const { server, call, base } = await startApp();
  try {
    const key = { key: "student:79" };
    assert.equal((await call("POST", "/acquire", { tz: GUIDE_U.tz, client: "tab-1", body: key })).status, 200);
    const beacon = (payload) => fetch(`${base}/api/locks/release`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...key, ...payload }),
    });
    assert.equal((await beacon({ clientId: "tab-1", token: "not-a-token" })).status, 401);
    assert.equal((await call("POST", "/acquire", { tz: ADMIN_U.tz, client: "tab-2", body: key })).status, 423, "still held");
    assert.equal((await beacon({ clientId: "tab-2", token: ADMIN_U.tz })).status, 200);
    assert.equal((await call("POST", "/acquire", { tz: ADMIN_U.tz, client: "tab-2", body: key })).status, 423, "a non-owner release changes nothing");
  } finally { server.close(); }
});

test("routes: heartbeat is 200 while held and 410 LOST after force-release", async () => {
  const { server, call } = await startApp();
  try {
    const key = { key: "attendance:5:2026-10-25" };
    await call("POST", "/acquire", { tz: GUIDE_U.tz, client: "tab-1", body: key });
    assert.equal((await call("POST", "/heartbeat", { tz: GUIDE_U.tz, client: "tab-1", body: key })).status, 200);
    assert.equal((await call("POST", "/force-release", { tz: ADMIN_U.tz, client: "tab-9", body: key })).status, 200);
    const lost = await call("POST", "/heartbeat", { tz: GUIDE_U.tz, client: "tab-1", body: key });
    assert.equal(lost.status, 410);
    assert.deepEqual(lost.body, { ok: false, code: "LOST" });
  } finally { server.close(); }
});

test("routes: force-release needs permissions.manage", async () => {
  const { server, call } = await startApp();
  try {
    const key = { key: "student:1" };
    await call("POST", "/acquire", { tz: ADMIN_U.tz, client: "tab-1", body: key });
    const denied = await call("POST", "/force-release", { tz: GUIDE_U.tz, client: "tab-2", body: key });
    assert.equal(denied.status, 403);
    assert.equal((await call("POST", "/heartbeat", { tz: ADMIN_U.tz, client: "tab-1", body: key })).status, 200);
  } finally { server.close(); }
});

test("routes: bad keys and a missing client id are 400; no auth is 401", async () => {
  const { server, call } = await startApp();
  try {
    for (const key of ["", "bogus:1", "student:", "student:a b", "attendance:5", "attendance:5:25-10-2026", "student:1:2", undefined, 7]) {
      const res = await call("POST", "/acquire", { tz: GUIDE_U.tz, client: "tab-1", body: { key } });
      assert.equal(res.status, 400, String(key));
    }
    assert.equal((await call("GET", "/nope", { tz: GUIDE_U.tz, client: "tab-1" })).status, 400);
    assert.equal((await call("POST", "/acquire", { tz: GUIDE_U.tz, body: { key: "student:1" } })).status, 400);
    assert.equal((await call("POST", "/acquire", { client: "tab-1", body: { key: "student:1" } })).status, 401);
    for (const key of ["student:1", "player:2", "lesson:3", "sportLesson:4", "attendance:5:2026-10-25", "sportAttendance:6:2026-10-25", "report:7", "user:8", "vehicle:9"]) {
      assert.equal((await call("POST", "/acquire", { tz: ADMIN_U.tz, client: "tab-1", body: { key } })).status, 200, key);
    }
  } finally { server.close(); }
});

/* ---------------- per-item permissions and messages ---------------- */

test("routes: acquire without the module's edit permission is 403 and takes no lock", async () => {
  const { server, call, model } = await startApp();
  try {
    for (const key of ["vehicle:9", "player:2", "sportLesson:4", "sportAttendance:6:2026-10-25", "user:8"]) {
      const res = await call("POST", "/acquire", { tz: GUIDE_U.tz, client: "tab-1", body: { key } });
      assert.equal(res.status, 403, key);
      assert.equal(model.rows.has(key), false, key);
    }
  } finally { server.close(); }
});

test("routes: heartbeat needs the same edit permission", async () => {
  const { server, call, locks } = await startApp();
  try {
    await locks.acquire("vehicle:9", { clientId: "tab-1", userId: "x", tz: "t", name: "n" });
    assert.equal((await call("POST", "/heartbeat", { tz: GUIDE_U.tz, client: "tab-1", body: { key: "vehicle:9" } })).status, 403);
  } finally { server.close(); }
});

test("routes: a user may lock his own record without users.edit", async () => {
  const { server, call } = await startApp();
  try {
    assert.equal((await call("POST", "/acquire", { tz: GUIDE_U.tz, client: "tab-1", body: { key: `user:${GUIDE_U._id}` } })).status, 200);
  } finally { server.close(); }
});

test("routes: GET /:key without the module's view permission answers holder null", async () => {
  const { server, call, locks } = await startApp();
  try {
    await locks.acquire("vehicle:9", A);
    await locks.acquire("player:2", A);
    for (const key of ["vehicle:9", "player:2"]) {
      const res = await call("GET", `/${encodeURIComponent(key)}`, { tz: GUIDE_U.tz, client: "tab-1" });
      assert.equal(res.status, 200, key);
      assert.deepEqual(res.body, { ok: true, holder: null }, key);
    }
    await locks.acquire("student:5", A);
    const seen = await call("GET", "/student:5", { tz: GUIDE_U.tz, client: "tab-1" });
    assert.deepEqual(seen.body.holder, { name: "Aa Aa", tz: "t-a" });
  } finally { server.close(); }
});

test("routes: the 423 answer carries the Arabic holder message, without () for an empty tz", async () => {
  const { server, call, locks } = await startApp();
  try {
    await locks.acquire("student:5", A);
    const res = await call("POST", "/acquire", { tz: GUIDE_U.tz, client: "tab-1", body: { key: "student:5" } });
    assert.equal(res.status, 423);
    assert.equal(res.body.message, "هذا العنصر مفتوح الآن لدى Aa Aa (t-a)");
    await locks.acquire("student:6", { ...A, tz: "" });
    const bare = await call("POST", "/acquire", { tz: GUIDE_U.tz, client: "tab-1", body: { key: "student:6" } });
    assert.equal(bare.body.message, "هذا العنصر مفتوح الآن لدى Aa Aa");
  } finally { server.close(); }
});

test("routes: acquire says whether it created the lock or refreshed this tab's own", async () => {
  const { server, call } = await startApp();
  try {
    const key = { key: "student:40" };
    const first = await call("POST", "/acquire", { tz: GUIDE_U.tz, client: "tab-1", body: key });
    assert.equal(first.body.created, true);
    const again = await call("POST", "/acquire", { tz: GUIDE_U.tz, client: "tab-1", body: key });
    assert.equal(again.body.created, false);
  } finally { server.close(); }
});

test("the Locks collection has a TTL index on expiresAt", () => {
  const { LOCK_INDEXES } = require("../Entities/Lock/Lock.model");
  const ttl = LOCK_INDEXES.find((index) => index.key.expiresAt === 1);
  assert.ok(ttl, "TTL index declared");
  assert.equal(ttl.options.expireAfterSeconds, 0);
});

test("an ObjectId in the key is matched in any letter case (MongoDB reads both as one record)", async () => {
  const { locks, events } = setup();
  const id = "abcdef123456abcdef123456";
  assert.equal((await locks.acquire(`report:${id}`, A)).ok, true);
  assert.deepEqual(await locks.holderOf(`report:${id.toUpperCase()}`, "tab-b"), { name: "Aa Aa", tz: "t-a" });
  assert.equal((await locks.acquire(`report:${id.toUpperCase()}`, B)).ok, false);
  assert.equal((await locks.acquire(`attendance:${id.toUpperCase()}:2026-10-25`, A)).ok, true);
  assert.deepEqual(await locks.holderOf(`attendance:${id}:2026-10-25`, "tab-b"), { name: "Aa Aa", tz: "t-a" });
  assert.equal(await locks.heartbeat(`report:${id.toUpperCase()}`, "tab-a"), true);
  await locks.release(`report:${id.toUpperCase()}`, "tab-a");
  assert.equal(await locks.holderOf(`report:${id}`, "tab-b"), null);
  assert.ok(events.every((e) => e.payload.key === e.payload.key.replace(/[A-F]/g, (c) => c.toLowerCase())));
});

test("normalizeKey lowercases ObjectId segments only", () => {
  const { normalizeKey } = require("../services/locks");
  assert.equal(normalizeKey("report:ABCDEF123456ABCDEF123456"), "report:abcdef123456abcdef123456");
  assert.equal(normalizeKey("sportAttendance:ABCDEF123456ABCDEF123456:2026-10-25"), "sportAttendance:abcdef123456abcdef123456:2026-10-25");
  assert.equal(normalizeKey("player:123456789"), "player:123456789");
  assert.equal(normalizeKey("vehicle:AB-123"), "vehicle:AB-123");
});

test("routes: report locks follow report ownership (editOwn locks only his own; the holder shows only to who may see the report)", async () => {
  const REPORTS = [
    { _id: "r-guide", createdBy: GUIDE_U._id },
    { _id: "r-admin", createdBy: ADMIN_U._id },
  ];
  const reports = { get: async ({ _id }) => ({ result: REPORTS.filter((r) => r._id === _id) }) };
  const { server, call, locks } = await startApp({ reports });
  try {
    const own = await call("POST", "/acquire", { tz: GUIDE_U.tz, client: "tab-g", body: { key: "report:r-guide" } });
    assert.equal(own.status, 200);
    const other = await call("POST", "/acquire", { tz: GUIDE_U.tz, client: "tab-g", body: { key: "report:r-admin" } });
    assert.equal(other.status, 403, "editOwn cannot lock someone else's report");
    assert.equal((await call("POST", "/acquire", { tz: GUIDE_U.tz, client: "tab-g", body: { key: "report:missing" } })).status, 403);

    await locks.acquire("report:r-admin", { clientId: "tab-a", userId: ADMIN_U._id, tz: ADMIN_U.tz, name: "Ad Min" });
    const hidden = await call("GET", "/report:r-admin", { tz: GUIDE_U.tz, client: "tab-g" });
    assert.deepEqual(hidden.body, { ok: true, holder: null }, "no name or ID number for a report he cannot see");
    const seen = await call("GET", "/report:r-guide", { tz: ADMIN_U.tz, client: "tab-a" });
    assert.deepEqual(seen.body.holder, { name: "Gu Ide", tz: GUIDE_U.tz });
  } finally { server.close(); }
});
