const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");

const { createDriveConnectState } = require("../utils/driveConnectState");
const { createGoogleDriveRouter } = require("../Entities/Storage/GoogleDrive.route");
const { auditStub } = require("./helpers/auditStub");

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

function startApp({ tz = "000000000", permissions = [] } = {}) {
  const calls = { authUrlState: null, callbackCode: null };
  const audit = auditStub();
  const drive = {
    getAuthUrl(stateToken, options) { calls.authUrlState = stateToken; calls.authOptions = options; return `https://accounts.google.test/auth?state=${stateToken}`; },
    async handleOAuthCallback(code) { calls.callbackCode = code; return { email: "org@example.org" }; },
    async getStatus() { return { connected: true, email: "org@example.org" }; },
  };
  const requireAuth = (req, res, next) => {
    if (req.headers.authorization !== "Bearer ok") return res.status(401).json({ code: "NO_TOKEN" });
    req.user = { id: "admin-1", tz, roles: ["ادارة"] };
    req.actor = { id: "admin-1", tz, permissions: new Set(permissions) };
    return next();
  };
  const isSystemAccount = (user) => user?.tz === "000000000";

  const app = express();
  app.use("/api/storage/google", createGoogleDriveRouter({ drive, state: createDriveConnectState(), requireAuth, isSystemAccount, audit: audit.deps["../../utils/audit"].audit }));
  const server = http.createServer(app);
  return new Promise((resolve) =>
    server.listen(0, () => resolve({ server, calls, audit, base: `http://127.0.0.1:${server.address().port}/api/storage/google` }))
  );
}

const request = (url, options = {}) => fetch(url, { redirect: "manual", ...options });

test("full-account Drive access requires an explicit boolean opt-in behind the connect permission", async () => {
  const { server, base, calls } = await startApp();
  try {
    for (const [body, expected] of [[{}, false], [{ fullAccess: "true" }, false], [{ fullAccess: true }, true]]) {
      const response = await request(`${base}/connect-url`, { method: "POST", headers: { authorization: "Bearer ok", "Content-Type": "application/json" }, body: JSON.stringify(body) });
      assert.equal(response.status, 200);
      assert.equal(calls.authOptions.fullAccess, expected);
    }
  } finally { server.close(); }
  const denied = await startApp({ tz: "other" });
  try {
    assert.equal((await request(`${denied.base}/connect-url`, { method: "POST", headers: { authorization: "Bearer ok", "Content-Type": "application/json" }, body: JSON.stringify({ fullAccess: true }) })).status, 403);
    assert.equal(denied.calls.authOptions, undefined);
  } finally { denied.server.close(); }
});

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

test("a successful Drive connection is recorded once, by the account that started it", async () => {
  const { server, base, calls, audit } = await startApp();
  try {
    await request(`${base}/connect-url`, { method: "POST", headers: { authorization: "Bearer ok" } });
    await request(`${base}/callback?code=abc&state=${calls.authUrlState}`);
    assert.equal(audit.calls.length, 1);
    const [row] = audit.calls;
    assert.equal(row.module, "files");
    assert.equal(row.action, "drive_connect");
    assert.equal(row.targetLabel, "org@example.org");
    assert.equal(row.req.actor.tz, "000000000");
    assert.equal(row.req.actor.isSystem, true);

    // A replayed or forged callback records nothing.
    await request(`${base}/callback?code=abc&state=${calls.authUrlState}`);
    await request(`${base}/callback?code=abc&state=forged`);
    assert.equal(audit.calls.length, 1);
  } finally {
    server.close();
  }
});

// Owner, 2026-11-03: the linked account and «تغيير الحساب» are the system
// account's, and it may give them to anyone with storage.drive.
test("storage.drive lets another user change the Drive account; without it they may not", async () => {
  const granted = await startApp({ tz: "123456789", permissions: ["storage.drive"] });
  try {
    const status = await (await request(`${granted.base}/status`, { headers: { authorization: "Bearer ok" } })).json();
    assert.equal(status.canConnect, true);
    const res = await request(`${granted.base}/connect-url`, { method: "POST", headers: { authorization: "Bearer ok" } });
    assert.equal(res.status, 200);
    assert.ok((await res.json()).url.startsWith("https://accounts.google.test/"));
  } finally {
    granted.server.close();
  }
  const plain = await startApp({ tz: "123456789", permissions: ["files.manageAll"] });
  try {
    const status = await (await request(`${plain.base}/status`, { headers: { authorization: "Bearer ok" } })).json();
    assert.equal(status.canConnect, false);
  } finally {
    plain.server.close();
  }
});
