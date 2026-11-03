const assert = require("node:assert/strict");
const test = require("node:test");
const http = require("node:http");
const jwt = require("jsonwebtoken");

process.env.PASSWORD_ENC_KEY_HEX = process.env.PASSWORD_ENC_KEY_HEX || "0".repeat(64);
process.env.IT_SESSION_SECRET = "test-it-session-secret";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";
process.env.IT_HOST = "it.example.test";

const { createItAuth, CODE_SENT_MESSAGE, LOGIN_REFUSALS } = require("../Entities/It/It.auth");
const { createRequireIt, requireItHost, IT_COOKIE } = require("../middleware/requireIt");
const { hasRealEmail } = require("../utils/permissions");
const { sha256 } = require("../utils/jwt");

// Synthetic values only.
const SYSTEM_TZ = "900000001";
const SYSTEM_EMAIL = "owner@example.org";
const PASSWORD = "synthetic-pass-1";
const NOW = Date.parse("2026-11-03T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

// In-memory stand-in for a model: equality filters, upserting update.
function store(seed = []) {
  let docs = seed.map((d, i) => ({ _id: d._id || `d${i}`, ...d }));
  let next = docs.length;
  const matches = (d, f = {}) => Object.entries(f).every(([k, v]) => String(d[k]) === String(v));
  return {
    docs: () => docs,
    async get(f) { return { success: true, result: docs.filter((d) => matches(d, f)).map((d) => ({ ...d })) }; },
    async update(f, patch) {
      const hit = docs.find((d) => matches(d, f));
      if (hit) Object.assign(hit, patch); else docs.push({ _id: `d${next++}`, ...f, ...patch });
      return { success: true };
    },
    async increment(f, field, by = 1) {
      const hit = docs.find((d) => matches(d, f));
      if (hit) hit[field] = (Number(hit[field]) || 0) + by;
      return { success: true, result: hit ? { ...hit } : null };
    },
    async updateExisting(f, patch) {
      const hit = docs.find((d) => matches(d, f));
      if (hit) Object.assign(hit, patch);
      return { success: true, result: hit ? { ...hit } : null };
    },
    async delete(f) {
      const before = docs.length;
      docs = docs.filter((d) => !matches(d, f));
      return { success: true, result: { deletedCount: before - docs.length } };
    },
  };
}

const res = () => ({
  statusCode: 200, body: undefined, cookies: [], cleared: [],
  status(c) { this.statusCode = c; return this; },
  json(v) { this.body = v; return this; },
  cookie(name, value, options) { this.cookies.push({ name, value, options }); return this; },
  clearCookie(name, options) { this.cleared.push({ name, options }); return this; },
});

const fresh = new Date(NOW - DAY);
function seedUsers() {
  return [
    { _id: "u1", tz: "100000009", firstname: "It", lastname: "One", email: "it.one@example.com", isIT: true, itSince: new Date(NOW - 10 * DAY), photo: "https://example.com/p.jpg" },
    { _id: "u2", tz: "100000017", firstname: "It", lastname: "NoMail", email: "test@test.com", isIT: true },
    { _id: "u3", tz: "100000025", firstname: "Plain", lastname: "User", email: "plain@example.com", isIT: false },
    { _id: "u4", tz: "100000033", firstname: "It", lastname: "Blocked", email: "blocked@example.com", isIT: true, itBlockedAt: new Date(NOW - DAY) },
    { _id: "u5", tz: "100000041", firstname: "It", lastname: "Empty", email: "", isIT: true },
    { _id: "u6", tz: "100000058", firstname: "It", lastname: "Locked", email: "locked@example.com", isIT: true, lockedAt: new Date(NOW - DAY) },
    { _id: "s0", tz: SYSTEM_TZ, firstname: "System", lastname: "Admin", email: "system-admin@tamheed.local", isIT: true, role: null, passwordChangedAt: fresh },
  ].map((u) => ({ ...u, pw: PASSWORD }));
}

function setup({ users } = {}) {
  const clock = { t: NOW };
  const sent = [];
  const alerts = [];
  const audits = [];
  const failures = [];
  const checked = [];
  const stores = { users: store(users || seedUsers()), codes: store([]) };
  const deps = {
    users: stores.users,
    codes: stores.codes,
    verifyPassword: async (user, room, password) => { checked.push(user.tz); return { ok: password === user.pw }; },
    countFailure: async (req, user, room, isSystem) => { failures.push({ tz: user.tz, room, isSystem }); },
    clearFailures: async () => {},
    sendCode: async (to, code) => { sent.push({ to, code }); },
    sendAlert: async (to, mail) => { alerts.push({ to, mail }); },
    audit: { record: async (req, row) => { audits.push({ req, row }); } },
    makeCode: () => "123456",
    systemTz: () => SYSTEM_TZ,
    systemEmail: () => SYSTEM_EMAIL,
    log: () => {},
    now: () => clock.t,
  };
  const auth = createItAuth(deps);
  const requireIt = createRequireIt({ users: stores.users, systemTz: () => SYSTEM_TZ, log: () => {} });
  return { auth, deps, requireIt, stores, sent, alerts, audits, failures, checked, clock };
}

const flush = () => new Promise((r) => setImmediate(r));
const login = async (auth, tz, password) => { const r = res(); await auth.login({ body: { tz, password }, ip: "203.0.113.5" }, r); await flush(); return r; };
const verify = async (auth, tz, code) => { const r = res(); await auth.verify({ body: { tz, code }, ip: "203.0.113.5" }, r); await flush(); return r; };
const SENT = { ok: true, message: CODE_SENT_MESSAGE };
const refused = (code) => ({ ok: false, code, message: LOGIN_REFUSALS[code].message });

const runRequireIt = async (requireIt, { cookie, hostname = "it.example.test", headers = {} } = {}) => {
  const r = res();
  const req = { hostname, cookies: cookie === undefined ? {} : { [IT_COOKIE]: cookie }, headers };
  let nexted = false;
  await requireIt(req, r, () => { nexted = true; });
  return { r, req, nexted };
};

const signIn = async (ctx, tz) => {
  await login(ctx.auth, tz, PASSWORD);
  const r = await verify(ctx.auth, tz, "123456");
  assert.equal(r.statusCode, 200);
  return r.cookies.find((c) => c.name === IT_COOKIE).value;
};

test("hasRealEmail: empty, without @, and test@test.com are not real", () => {
  assert.equal(hasRealEmail({ email: "a@example.com" }), true);
  for (const email of ["", "   ", "nobody", "test@test.com", " TEST@Test.com ", undefined, null]) {
    assert.equal(hasRealEmail({ email }), false, String(email));
  }
  assert.equal(hasRealEmail(null), false);
});

test("login goes on to the code only after a right ID number and password, to an IT user with a real email", async () => {
  const ctx = setup();
  // Unknown, wrong password and missing input: one answer, the same for all.
  for (const [tz, password] of [["199999999", PASSWORD], ["100000009", "wrong-pass"], ["", ""]]) {
    const r = await login(ctx.auth, tz, password);
    assert.equal(r.statusCode, 401, tz);
    assert.deepEqual(r.body, refused("BAD_LOGIN"), tz);
  }
  // A right pair: the answer says why no code (not IT, blocked, placeholder or empty email).
  for (const [tz, code] of [["100000025", "NO_IT_ACCESS"], ["100000033", "NO_IT_ACCESS"], ["100000017", "NO_EMAIL"], ["100000041", "NO_EMAIL"]]) {
    const r = await login(ctx.auth, tz, PASSWORD);
    assert.equal(r.statusCode, 403, tz);
    assert.deepEqual(r.body, refused(code), tz);
  }
  assert.equal(ctx.sent.length, 0);
  assert.equal(ctx.stores.codes.docs().length, 0);

  const r = await login(ctx.auth, "100000009", PASSWORD);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, SENT);
  assert.deepEqual(ctx.sent, [{ to: "it.one@example.com", code: "123456" }]);
  const [row] = ctx.stores.codes.docs();
  assert.equal(row.userTz, "100000009");
  assert.equal(row.codeHash, sha256("123456"));
  assert.equal(new Date(row.expiresAt).getTime(), NOW + 10 * 60 * 1000);
  assert.ok(!JSON.stringify(row).includes("123456"));
});

test("a wrong password counts in the lockout, as on the everyday login", async () => {
  const ctx = setup();
  await login(ctx.auth, "100000009", "wrong-pass");
  await login(ctx.auth, SYSTEM_TZ, "wrong-pass");
  assert.deepEqual(ctx.failures, [
    { tz: "100000009", room: "active", isSystem: false },
    { tz: SYSTEM_TZ, room: "active", isSystem: true },
  ]);
});

test("a locked account is told so and gets no code, without a password check", async () => {
  const ctx = setup();
  const r = await login(ctx.auth, "100000058", PASSWORD);
  assert.equal(r.statusCode, 423);
  assert.deepEqual(r.body, refused("LOCKED"));
  assert.equal(ctx.sent.length, 0);
  assert.deepEqual(ctx.checked, []);
});

test("the system account's code goes to SYSTEM_ADMIN_EMAIL", async () => {
  const ctx = setup();
  const r = await login(ctx.auth, SYSTEM_TZ, PASSWORD);
  assert.deepEqual(r.body, SENT);
  assert.deepEqual(ctx.sent, [{ to: SYSTEM_EMAIL, code: "123456" }]);
});

test("the system account with its first (or a recovered) password gets no code: it changes it on the main site first", async () => {
  const users = seedUsers().map((u) => (u.tz === SYSTEM_TZ ? { ...u, passwordChangedAt: new Date(0) } : u));
  const ctx = setup({ users });
  const r = await login(ctx.auth, SYSTEM_TZ, PASSWORD);
  assert.deepEqual(r.body, refused("SYSTEM_PASSWORD_CHANGE"));
  assert.equal(ctx.sent.length, 0);
  assert.equal(ctx.stores.codes.docs().length, 0);
});

test("a wrong code five times ends the code", async () => {
  const ctx = setup();
  await login(ctx.auth, "100000009", PASSWORD);
  for (let i = 0; i < 5; i++) {
    const r = await verify(ctx.auth, "100000009", "000000");
    assert.equal(r.statusCode, 400);
    assert.equal(r.cookies.length, 0);
  }
  // Ended, but the row and its count stay until it expires.
  const [row] = ctx.stores.codes.docs();
  assert.equal(row.codeHash, null);
  assert.equal(row.attempts, 5);
  const right = await verify(ctx.auth, "100000009", "123456");
  assert.equal(right.statusCode, 400);
  assert.equal(right.cookies.length, 0);
});

test("after five wrong codes a new login sends nothing and no code works for ten minutes", async () => {
  let n = 0;
  const ctx = setup();
  ctx.auth = createItAuth({ ...ctx.deps, makeCode: () => ["111111", "222222", "333333"][n++] });
  await login(ctx.auth, "100000009", PASSWORD);
  for (let i = 0; i < 5; i++) await verify(ctx.auth, "100000009", "000000");
  ctx.clock.t += 60 * 1000;
  const again = await login(ctx.auth, "100000009", PASSWORD);
  assert.deepEqual(again.body, refused("TOO_MANY_CODES"));
  assert.equal(ctx.sent.length, 1);
  for (const code of ["111111", "222222"]) {
    const r = await verify(ctx.auth, "100000009", code);
    assert.equal(r.statusCode, 400, code);
    assert.equal(r.cookies.length, 0, code);
  }
  // Once the row has expired, a new login sends a fresh code that works.
  ctx.clock.t += 10 * 60 * 1000;
  await login(ctx.auth, "100000009", PASSWORD);
  assert.equal(ctx.sent.length, 2);
  assert.equal((await verify(ctx.auth, "100000009", ctx.sent[1].code)).statusCode, 200);
});

test("a new code keeps the wrong tries of the one it replaces", async () => {
  const ctx = setup();
  await login(ctx.auth, "100000009", PASSWORD);
  for (let i = 0; i < 4; i++) await verify(ctx.auth, "100000009", "000000");
  await login(ctx.auth, "100000009", PASSWORD);
  assert.equal(ctx.sent.length, 2);
  assert.equal(ctx.stores.codes.docs()[0].attempts, 4);
  // One more wrong try ends the new code too.
  await verify(ctx.auth, "100000009", "000000");
  assert.equal((await verify(ctx.auth, "100000009", "123456")).statusCode, 400);
});

test("a wrong code counts as a failed sign-in", async () => {
  const ctx = setup();
  await login(ctx.auth, "100000009", PASSWORD);
  await login(ctx.auth, SYSTEM_TZ, PASSWORD);
  await verify(ctx.auth, "100000009", "000000");
  await verify(ctx.auth, SYSTEM_TZ, "000000");
  assert.deepEqual(ctx.failures, [
    { tz: "100000009", room: "active", isSystem: false },
    { tz: SYSTEM_TZ, room: "active", isSystem: true },
  ]);
  // The right code counts nothing.
  await verify(ctx.auth, "100000009", "123456");
  assert.equal(ctx.failures.length, 2);
});

test("an expired code is refused", async () => {
  const ctx = setup();
  await login(ctx.auth, "100000009", PASSWORD);
  ctx.clock.t += 10 * 60 * 1000;
  const r = await verify(ctx.auth, "100000009", "123456");
  assert.equal(r.statusCode, 400);
  assert.equal(r.cookies.length, 0);
});

test("verify sets the IT cookie once per code", async () => {
  const ctx = setup();
  await login(ctx.auth, "100000009", PASSWORD);
  const r = await verify(ctx.auth, "100000009", "123456");
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, { ok: true });
  assert.equal(r.cookies.length, 1);
  const [{ name, value, options }] = r.cookies;
  assert.equal(name, "it_session");
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, "Strict");
  assert.equal(options.path, "/api/it");
  assert.equal(options.maxAge, 12 * 60 * 60 * 1000);
  assert.equal(options.secure, process.env.NODE_ENV === "production");
  const payload = jwt.verify(value, process.env.IT_SESSION_SECRET, { algorithms: ["HS256"] });
  assert.equal(payload.sub, "100000009");
  assert.equal(payload.typ, "it");
  assert.equal(payload.iat, Math.floor(NOW / 1000));
  assert.equal(payload.exp - payload.iat, 12 * 60 * 60);

  const again = await verify(ctx.auth, "100000009", "123456");
  assert.equal(again.statusCode, 400);
  assert.equal(again.cookies.length, 0);
  // An ordinary IT sign-in neither alerts nor is audited as the system's.
  assert.equal(ctx.alerts.length, 0);
});

test("a user blocked between the code and verify is refused", async () => {
  const ctx = setup();
  await login(ctx.auth, "100000009", PASSWORD);
  await ctx.stores.users.update({ tz: "100000009" }, { itBlockedAt: new Date(NOW) });
  const r = await verify(ctx.auth, "100000009", "123456");
  assert.equal(r.statusCode, 400);
  assert.equal(r.cookies.length, 0);
});

test("a system sign-in alerts and is audited", async () => {
  const ctx = setup();
  await login(ctx.auth, SYSTEM_TZ, PASSWORD);
  const r = await verify(ctx.auth, SYSTEM_TZ, "123456");
  assert.equal(r.statusCode, 200);
  assert.equal(ctx.alerts.length, 1);
  assert.equal(ctx.alerts[0].to, SYSTEM_EMAIL);
  assert.ok(ctx.alerts[0].mail.subject);
  assert.ok(!JSON.stringify(ctx.alerts[0].mail).includes(SYSTEM_TZ));
  assert.equal(ctx.audits.length, 1);
  assert.equal(ctx.audits[0].row.module, "it");
  assert.equal(ctx.audits[0].row.action, "sign_in");
  assert.equal(ctx.audits[0].req.actor.isSystem, true);
});

test("logout clears the IT cookie", () => {
  const ctx = setup();
  const r = res();
  ctx.auth.logout({}, r);
  assert.deepEqual(r.body, { ok: true });
  assert.equal(r.cleared[0].name, "it_session");
  assert.equal(r.cleared[0].options.path, "/api/it");
});

test("requireIt builds the IT actor, and me answers from it", async () => {
  const ctx = setup();
  const cookie = await signIn(ctx, "100000009");
  const { r, req, nexted } = await runRequireIt(ctx.requireIt, { cookie });
  assert.equal(nexted, true, JSON.stringify(r.body));
  assert.equal(req.actor.it, true);
  assert.equal(req.actor.tz, "100000009");
  assert.equal(req.actor.id, "u1");
  assert.equal(req.actor.name, "It One");
  assert.equal(req.actor.isSystem, false);
  assert.ok(req.actor.permissions instanceof Set);
  assert.ok(req.actor.permissions.has("permissions.manage"));

  const me = res();
  await ctx.auth.me(req, me);
  assert.deepEqual(me.body, { ok: true, tz: "100000009", name: "It One", isSystem: false, photo: "https://example.com/p.jpg", hasEverydayRole: false, mustChangePassword: false });

  // An IT user who also has an everyday role: the same condition the pass routes use.
  const both = res();
  await ctx.auth.me({ actor: { ...req.actor, user: { ...req.actor.user, role: "مرشد" } } }, both);
  assert.equal(both.body.hasEverydayRole, true);

  const sys = await runRequireIt(ctx.requireIt, { cookie: await signIn(ctx, SYSTEM_TZ) });
  assert.equal(sys.nexted, true);
  assert.equal(sys.req.actor.isSystem, true);
});

test("IT routes refuse any host but IT_HOST", async () => {
  const ctx = setup();
  const cookie = await signIn(ctx, "100000009");
  for (const hostname of ["tamheed.example.test", "sport.example.test", ""]) {
    const { r, nexted } = await runRequireIt(ctx.requireIt, { cookie, hostname });
    assert.equal(nexted, false);
    assert.equal(r.statusCode, 404);
  }
  // Case-insensitive, like the sport host.
  assert.equal((await runRequireIt(ctx.requireIt, { cookie, hostname: "IT.example.TEST" })).nexted, true);

  // The router's own guard, before any route.
  const guard = (hostname) => { const r = res(); let n = false; requireItHost({ hostname }, r, () => { n = true; }); return { r, n }; };
  assert.equal(guard("it.example.test").n, true);
  assert.equal(guard("tamheed.example.test").r.statusCode, 404);

  // Without IT_HOST nothing is served.
  const saved = process.env.IT_HOST;
  delete process.env.IT_HOST;
  try {
    assert.equal(guard("it.example.test").r.statusCode, 404);
    assert.equal((await runRequireIt(ctx.requireIt, { cookie })).r.statusCode, 404);
  } finally { process.env.IT_HOST = saved; }
});

test("the mounted /api/it router answers 404 on another host", async () => {
  const express = require("express");
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use(require("cookie-parser")());
  app.use("/api/it", require("../Entities/It/It.route"));
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const call = (method, path, host) => new Promise((resolve, reject) => {
      const req = http.request({ port, path, method, headers: { Host: host, "Content-Type": "application/json" } }, (r) => {
        let body = ""; r.on("data", (c) => { body += c; }); r.on("end", () => resolve({ status: r.statusCode, body }));
      });
      req.on("error", reject);
      req.end(method === "POST" ? "{}" : undefined);
    });
    assert.equal((await call("POST", "/api/it/login", "tamheed.example.test")).status, 404);
    assert.equal((await call("GET", "/api/it/me", "tamheed.example.test")).status, 404);
    const me = await call("GET", "/api/it/me", "it.example.test");
    assert.equal(me.status, 401);
    assert.equal(JSON.parse(me.body).code, "IT_SIGNED_OUT");
  } finally { server.close(); }
});

test("an everyday Bearer token is not an IT session", async () => {
  const ctx = setup();
  const everyday = jwt.sign({ id: "u1", tz: "100000009", room: "active" }, process.env.JWT_ACCESS_SECRET);
  const bearer = await runRequireIt(ctx.requireIt, { headers: { authorization: `Bearer ${everyday}` } });
  assert.equal(bearer.nexted, false);
  assert.equal(bearer.r.statusCode, 401);
  assert.equal(bearer.r.body.code, "IT_SIGNED_OUT");
  // The everyday token in the IT cookie, and a right-secret token of another type.
  for (const cookie of [everyday, jwt.sign({ sub: "100000009", typ: "sport-student" }, process.env.IT_SESSION_SECRET)]) {
    const { r, nexted } = await runRequireIt(ctx.requireIt, { cookie });
    assert.equal(nexted, false);
    assert.equal(r.statusCode, 401);
    assert.equal(r.body.code, "IT_SIGNED_OUT");
  }
});

test("a blocked or removed IT user is signed out on the next request", async () => {
  for (const patch of [{ itBlockedAt: new Date(NOW + 1000) }, { isIT: false }]) {
    const ctx = setup();
    const cookie = await signIn(ctx, "100000009");
    assert.equal((await runRequireIt(ctx.requireIt, { cookie })).nexted, true);
    await ctx.stores.users.update({ tz: "100000009" }, patch);
    const { r, nexted } = await runRequireIt(ctx.requireIt, { cookie });
    assert.equal(nexted, false, JSON.stringify(patch));
    assert.equal(r.statusCode, 401);
    assert.equal(r.body.code, "IT_SIGNED_OUT");
  }
});

test("a session older than a password change or a return to IT is signed out", async () => {
  for (const patch of [{ passwordChangedAt: new Date(NOW + 2000) }, { itSince: new Date(NOW + 2000) }]) {
    const ctx = setup();
    const cookie = await signIn(ctx, "100000009");
    await ctx.stores.users.update({ tz: "100000009" }, patch);
    const { r, nexted } = await runRequireIt(ctx.requireIt, { cookie });
    assert.equal(nexted, false, JSON.stringify(patch));
    assert.equal(r.body.code, "IT_SIGNED_OUT");
  }
  // A user who left the active room is signed out too.
  const ctx = setup();
  const cookie = await signIn(ctx, "100000009");
  await ctx.stores.users.delete({ tz: "100000009" });
  assert.equal((await runRequireIt(ctx.requireIt, { cookie })).r.statusCode, 401);
});

test("missing IT_SESSION_SECRET fails closed", async () => {
  const ctx = setup();
  const cookie = await signIn(ctx, "100000009");
  const saved = process.env.IT_SESSION_SECRET;
  delete process.env.IT_SESSION_SECRET;
  try {
    const before = ctx.sent.length;
    const r = await login(ctx.auth, "100000009", PASSWORD);
    assert.equal(r.statusCode, 500);
    assert.equal(ctx.sent.length, before);
    const v = await verify(ctx.auth, "100000009", "123456");
    assert.notEqual(v.statusCode, 200);
    assert.equal(v.cookies.length, 0);
    const { nexted, r: guarded } = await runRequireIt(ctx.requireIt, { cookie });
    assert.equal(nexted, false);
    assert.equal(guarded.statusCode, 500);
  } finally { process.env.IT_SESSION_SECRET = saved; }
});

test("a new IT user with a temporary password still gets the code (he changes it right after)", async () => {
  const ctx = setup();
  const user = ctx.stores.users.docs().find((d) => d.tz === "100000009");
  user.mustChangePassword = true;
  await login(ctx.auth, "100000009", PASSWORD);
  assert.deepEqual(ctx.sent, [{ to: "it.one@example.com", code: "123456" }]);
});
