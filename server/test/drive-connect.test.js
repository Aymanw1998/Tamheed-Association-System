const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");

const { createDriveConnectState } = require("../utils/driveConnectState");
const { createGoogleDriveRouter } = require("../Entities/Storage/GoogleDrive.route");

test("a connect state is single-use and bound to the admin who asked for it", () => {
  const state = createDriveConnectState();
  const token = state.issue("admin-1", 1000);
  assert.match(token, /^[a-f0-9]{48}$/);
  assert.deepEqual(state.consume(token, 2000), { userId: "admin-1" });
  assert.equal(state.consume(token, 2001), null);
});

test("a connect state expires after 10 minutes and unknown states are rejected", () => {
  const state = createDriveConnectState();
  const token = state.issue("admin-1", 0);
  assert.equal(state.consume(token, 10 * 60 * 1000 + 1), null);
  assert.equal(state.consume("not-a-real-state", 0), null);
  assert.equal(state.consume("", 0), null);
  assert.equal(state.consume(undefined, 0), null);
});

// ---- route wiring (stubbed auth and Drive; no Google calls) ----

function startApp({ tz = "000000000" } = {}) {
  const calls = { authUrlState: null, callbackCode: null };
  const drive = {
    getAuthUrl(stateToken) { calls.authUrlState = stateToken; return `https://accounts.google.test/auth?state=${stateToken}`; },
    async handleOAuthCallback(code) { calls.callbackCode = code; return { email: "org@example.org" }; },
    async getStatus() { return { connected: true, email: "org@example.org" }; },
  };
  const requireAuth = (req, res, next) => {
    if (req.headers.authorization !== "Bearer ok") return res.status(401).json({ code: "NO_TOKEN" });
    req.user = { id: "admin-1", tz, roles: ["ادارة"] };
    return next();
  };
  const isSystemAccount = (user) => user?.tz === "000000000";

  const app = express();
  app.use("/api/storage/google", createGoogleDriveRouter({ drive, state: createDriveConnectState(), requireAuth, isSystemAccount }));
  const server = http.createServer(app);
  return new Promise((resolve) =>
    server.listen(0, () => resolve({ server, calls, base: `http://127.0.0.1:${server.address().port}/api/storage/google` }))
  );
}

const request = (url, options = {}) => fetch(url, { redirect: "manual", ...options });

test("the old open /connect link no longer starts a connection", async () => {
  const { server, base } = await startApp();
  try {
    const res = await request(`${base}/connect`);
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test("only the system account (not other administrators) gets a connect URL", async () => {
  const { server, base } = await startApp({ tz: "123456789" });
  try {
    assert.equal((await request(`${base}/connect-url`, { method: "POST" })).status, 401);
    const otherAdmin = await request(`${base}/connect-url`, { method: "POST", headers: { authorization: "Bearer ok" } });
    assert.equal(otherAdmin.status, 403);
  } finally {
    server.close();
  }
});

test("callback without a valid state is refused and never stores a connection", async () => {
  const { server, base, calls } = await startApp();
  try {
    const res = await request(`${base}/callback?code=abc&state=forged`);
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/files?drive=denied");
    assert.equal(calls.callbackCode, null);
  } finally {
    server.close();
  }
});

test("admin flow: connect URL carries a state the callback accepts exactly once", async () => {
  const { server, base, calls } = await startApp();
  try {
    const urlRes = await request(`${base}/connect-url`, { method: "POST", headers: { authorization: "Bearer ok" } });
    assert.equal(urlRes.status, 200);
    const { url } = await urlRes.json();
    assert.ok(url.includes(`state=${calls.authUrlState}`));

    const first = await request(`${base}/callback?code=abc&state=${calls.authUrlState}`);
    assert.equal(first.headers.get("location"), "/files?drive=connected");
    assert.equal(calls.callbackCode, "abc");

    calls.callbackCode = null;
    const replay = await request(`${base}/callback?code=abc&state=${calls.authUrlState}`);
    assert.equal(replay.headers.get("location"), "/files?drive=denied");
    assert.equal(calls.callbackCode, null);
  } finally {
    server.close();
  }
});

test("status requires sign-in and tells whether this user may connect", async () => {
  const system = await startApp();
  const other = await startApp({ tz: "123456789" });
  try {
    assert.equal((await request(`${system.base}/status`)).status, 401);
    const ok = await request(`${system.base}/status`, { headers: { authorization: "Bearer ok" } });
    assert.deepEqual(await ok.json(), { ok: true, connected: true, email: "org@example.org", canConnect: true });
    const no = await request(`${other.base}/status`, { headers: { authorization: "Bearer ok" } });
    assert.equal((await no.json()).canConnect, false);
  } finally {
    system.server.close();
    other.server.close();
  }
});

test("isSystemAccount matches SYSTEM_ADMIN_TZ only, and nobody when it is unset", () => {
  const { isSystemAccount } = require("../Entities/Storage/GoogleDrive.route");
  assert.equal(isSystemAccount({ tz: "000000000" }, " 000000000 "), true);
  assert.equal(isSystemAccount({ tz: "123456789" }, "000000000"), false);
  assert.equal(isSystemAccount({ tz: "" }, ""), false);
  assert.equal(isSystemAccount({}, ""), false);
});
