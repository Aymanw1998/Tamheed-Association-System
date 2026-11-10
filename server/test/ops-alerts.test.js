const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { createOpsAlerts, healthHandler, THROTTLE_MS, DB_GRACE_MS } = require("../services/opsAlerts");

// The owner is told by email when the server goes down (owner, 2026-11-10):
// a crash (told on the restart that follows), a database connection lost for
// more than DB_GRACE_MS, and its return. The address is OPS_ALERT_EMAIL in the
// server's .env, never in the repository.

function setup({ to = "ops@example.test", start = Date.parse("2026-11-10T08:00:00Z") } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tamheed-ops-"));
  const clock = { t: start };
  const sent = [];
  const timers = [];
  const logs = [];
  const make = () => createOpsAlerts({
    dir,
    to: () => to,
    send: async (address, subject, text) => { sent.push({ address, subject, text }); },
    now: () => clock.t,
    setTimer: (fn, ms) => { const timer = { fn, ms, cleared: false }; timers.push(timer); return timer; },
    clearTimer: (timer) => { if (timer) timer.cleared = true; },
    log: (...args) => logs.push(args),
  });
  return { dir, clock, sent, timers, logs, make };
}

const flush = () => new Promise((r) => setImmediate(r));

test("a crash is written down and told by email on the next start, once", async () => {
  const ctx = setup();
  ctx.make().recordCrash("uncaughtException", new Error("boom in handler"));
  assert.equal(ctx.sent.length, 0, "nothing is sent while the process is dying");
  await ctx.make().onStartup();
  assert.equal(ctx.sent.length, 1);
  assert.equal(ctx.sent[0].address, "ops@example.test");
  assert.match(ctx.sent[0].subject, /توقف الخادم/);
  assert.match(ctx.sent[0].text, /boom in handler/);
  assert.match(ctx.sent[0].text, /uncaughtException/);
  await ctx.make().onStartup();
  assert.equal(ctx.sent.length, 1, "the same crash is not told twice");
});

test("a normal start (a deploy) sends nothing", async () => {
  const ctx = setup();
  await ctx.make().onStartup();
  assert.equal(ctx.sent.length, 0);
});

test("crash emails are throttled across restarts", async () => {
  const ctx = setup();
  ctx.make().recordCrash("startup", new Error("db refused"));
  await ctx.make().onStartup();
  ctx.clock.t += 60 * 1000;
  ctx.make().recordCrash("startup", new Error("db refused"));
  await ctx.make().onStartup();
  assert.equal(ctx.sent.length, 1, "a restart loop does not flood the inbox");
  ctx.clock.t += THROTTLE_MS;
  ctx.make().recordCrash("startup", new Error("db refused"));
  await ctx.make().onStartup();
  assert.equal(ctx.sent.length, 2);
});

test("a long error message is cut and the stack never goes out", async () => {
  const ctx = setup();
  const err = new Error("x".repeat(2000));
  ctx.make().recordCrash("unhandledRejection", err);
  await ctx.make().onStartup();
  assert.ok(ctx.sent[0].text.length < 1000);
  assert.doesNotMatch(ctx.sent[0].text, /at .*\.js:\d+/);
});

test("without OPS_ALERT_EMAIL nothing is sent and nothing fails", async () => {
  const ctx = setup({ to: "" });
  ctx.make().recordCrash("uncaughtException", new Error("boom"));
  await ctx.make().onStartup();
  assert.equal(ctx.sent.length, 0);
});

test("a database drop is told only after the grace period, and its return too", async () => {
  const ctx = setup();
  const alerts = ctx.make();
  const connection = new EventEmitter();
  alerts.watchDb(connection);
  connection.emit("disconnected");
  assert.equal(ctx.timers.length, 1);
  assert.equal(ctx.timers[0].ms, DB_GRACE_MS);
  ctx.timers[0].fn();
  await flush();
  assert.equal(ctx.sent.length, 1);
  assert.match(ctx.sent[0].subject, /قاعدة البيانات/);
  connection.emit("reconnected");
  await flush();
  assert.equal(ctx.sent.length, 2);
  assert.match(ctx.sent[1].subject, /عاد/);
});

test("a short database blip sends nothing", async () => {
  const ctx = setup();
  const alerts = ctx.make();
  const connection = new EventEmitter();
  alerts.watchDb(connection);
  connection.emit("disconnected");
  connection.emit("connected");
  assert.equal(ctx.timers[0].cleared, true);
  await flush();
  assert.equal(ctx.sent.length, 0);
});

test("a failing mail server is logged, never thrown", async () => {
  const ctx = setup();
  const alerts = createOpsAlerts({
    dir: ctx.dir, to: () => "ops@example.test", now: () => ctx.clock.t,
    send: async () => { throw new Error("smtp down"); }, log: (...a) => ctx.logs.push(a),
  });
  alerts.recordCrash("uncaughtException", new Error("boom"));
  await alerts.onStartup();
  assert.equal(ctx.logs.length, 1);
});

const res = () => ({ statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });

test("the health check answers 200 with the database up and 503 without it", () => {
  const up = res();
  healthHandler({ readyState: 1 })({}, up);
  assert.equal(up.statusCode, 200);
  assert.equal(up.body.ok, true);
  assert.equal(up.body.db, "up");
  const down = res();
  healthHandler({ readyState: 0 })({}, down);
  assert.equal(down.statusCode, 503);
  assert.equal(down.body.ok, false);
  assert.equal(down.body.db, "down");
});

test("server.js wires the health check and the alerts", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(server, /app\.get\('\/api\/health', healthHandler\(/);
  assert.match(server, /opsAlerts\.recordCrash\('uncaughtException'/);
  assert.match(server, /opsAlerts\.recordCrash\('unhandledRejection'/);
  assert.match(server, /opsAlerts\.recordCrash\('startup'/);
  assert.match(server, /opsAlerts\.onStartup\(\)/);
  assert.match(server, /opsAlerts\.watchDb\(/);
});
