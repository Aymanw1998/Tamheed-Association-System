const assert = require("node:assert/strict");
const live = require("./helpers/liveStubs");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const bcrypt = require("bcryptjs");
const { auditStub } = require("./helpers/auditStub");

process.env.PASSWORD_ENC_KEY_HEX = process.env.PASSWORD_ENC_KEY_HEX || "0".repeat(64);
process.env.IT_SESSION_SECRET = "test-it-session-secret";
process.env.IT_HOST = "it.example.test";

const { createItAuth, GENERIC_LOGIN_MESSAGE } = require("../Entities/It/It.auth");
const { createSitePasses, PASS_TTL_MS } = require("../Entities/It/sitePass");
const { SITE_PASS_INDEXES } = require("../Entities/It/SitePass.model");
const { IT_COOKIE } = require("../middleware/requireIt");
const { sha256 } = require("../utils/jwt");

// Synthetic values only.
const SYSTEM_TZ = "900000001";
const SYSTEM_EMAIL = "owner@example.org";
const PASSWORD = "synthetic-pass-1";
const NOW = Date.parse("2026-11-03T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const HASH = bcrypt.hashSync(PASSWORD, 4);

// In-memory stand-in for a model: equality filters, upserting update.
function store(seed = []) {
  let docs = seed.map((d, i) => ({ _id: d._id || `d${i}`, ...d }));
  let next = docs.length;
  const matches = (d, f = {}) => Object.entries(f).every(([k, v]) => String(d[k]) === String(v));
  return {
    docs: () => docs,
    async get(f) { return { success: true, result: docs.filter((d) => matches(d, f)).map((d) => ({ ...d })) }; },
    async create(data) { const doc = { _id: `d${next++}`, ...data }; docs.push(doc); return { success: true, result: { ...doc } }; },
    async update(f, patch) {
      const hit = docs.find((d) => matches(d, f));
      if (hit) Object.assign(hit, patch); else docs.push({ _id: `d${next++}`, ...f, ...patch });
      return { success: true, result: hit ? { ...hit } : null };
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
  statusCode: 200, body: undefined, cookies: [], cleared: [], refreshCookie: null,
  status(c) { this.statusCode = c; return this; },
  json(v) { this.body = v; return this; },
  cookie(name, value, options) { this.cookies.push({ name, value, options }); return this; },
  clearCookie(name, options) { this.cleared.push({ name, options }); return this; },
});

const fresh = new Date(NOW - DAY);
function seedUsers() {
  return [
    // IT with an everyday role: both sides.
    { _id: "u1", tz: "100000009", firstname: "It", lastname: "Both", email: "it.both@example.com", isIT: true, roles: ["مرشد"], itSince: new Date(NOW - 10 * DAY) },
    // IT, no everyday role.
    { _id: "u2", tz: "100000017", firstname: "It", lastname: "Only", email: "it.only@example.com", isIT: true, roles: [] },
    // Everyday only.
    { _id: "u3", tz: "100000025", firstname: "Plain", lastname: "User", email: "plain@example.com", isIT: false, roles: ["مرشد"] },
    // IT, blocked, with a role.
    { _id: "u4", tz: "100000033", firstname: "It", lastname: "Blocked", email: "blocked@example.com", isIT: true, roles: ["مرشد"], itBlockedAt: new Date(NOW - DAY) },
    // IT with a role but no real email.
    { _id: "u5", tz: "100000041", firstname: "It", lastname: "NoMail", email: "test@test.com", isIT: true, roles: ["مرشد"] },
    // The system account: IT, no everyday role.
    { _id: "s0", tz: SYSTEM_TZ, firstname: "System", lastname: "Admin", email: "system-admin@tamheed.local", isIT: true, role: null, roles: [], passwordChangedAt: fresh },
  ].map((u) => ({ ...u, pw: PASSWORD, password: HASH }));
}

function setup({ users, signInEveryday } = {}) {
  const clock = { t: NOW };
  const sent = [];
  const alerts = [];
  const audits = [];
  const failures = [];
  const signIns = [];
  const stores = { users: store(users || seedUsers()), codes: store([]), passes: store([]) };
  const audit = { record: async (req, row) => { audits.push({ req, row }); } };
  const itAuth = createItAuth({
    users: stores.users,
    codes: stores.codes,
    verifyPassword: async (user, room, password) => ({ ok: password === user.pw }),
    countFailure: async (req, user) => { failures.push(user.tz); },
    clearFailures: async () => {},
    sendCode: async (to, code) => { sent.push({ to, code }); },
    sendAlert: async (to, mail) => { alerts.push({ to, mail }); },
    audit,
    makeCode: () => "123456",
    systemTz: () => SYSTEM_TZ,
    systemEmail: () => SYSTEM_EMAIL,
    log: () => {},
    now: () => clock.t,
  });
  const passes = createSitePasses({
    passes: stores.passes,
    users: stores.users,
    itAuth,
    signInEveryday: signInEveryday || (async (req, r, user) => { signIns.push(user.tz); return r.json({ ok: true, accessToken: "access" }); }),
    audit,
    systemTz: () => SYSTEM_TZ,
    log: () => {},
    now: () => clock.t,
  });
  return { itAuth, passes, stores, sent, alerts, audits, failures, signIns, clock };
}

const flush = () => new Promise((r) => setImmediate(r));
const userOf = (ctx, tz) => ctx.stores.users.docs().find((u) => u.tz === tz);
// req.actor as loadActor (everyday) and requireIt (IT) build it.
const everydayActor = (ctx, tz) => ({ tz, isSystem: tz === SYSTEM_TZ, user: userOf(ctx, tz) });
const itActor = (ctx, tz) => ({ tz, isSystem: tz === SYSTEM_TZ, it: true, user: userOf(ctx, tz) });

const askItPass = async (ctx, tz) => { const r = res(); await ctx.passes.itPass({ actor: everydayActor(ctx, tz), ip: "203.0.113.5" }, r); return r; };
const askSystemPass = async (ctx, tz) => { const r = res(); await ctx.passes.systemPass({ actor: itActor(ctx, tz), ip: "203.0.113.5" }, r); return r; };
const toIt = async (ctx, pass) => { const r = res(); await ctx.passes.loginToIt({ body: { pass }, ip: "203.0.113.5" }, r); await flush(); return r; };
const toSystem = async (ctx, pass) => { const r = res(); await ctx.passes.loginToSystem({ body: { pass }, ip: "203.0.113.5", headers: {}, cookies: {} }, r); await flush(); return r; };
const verify = async (ctx, tz, code) => { const r = res(); await ctx.itAuth.verify({ body: { tz, code }, ip: "203.0.113.5" }, r); await flush(); return r; };

test("a pass works once and only within 60 seconds", async () => {
  assert.equal(PASS_TTL_MS, 60 * 1000);
  const ctx = setup();

  const issued = await askSystemPass(ctx, "100000009");
  assert.equal(issued.statusCode, 200);
  const { pass } = issued.body;
  assert.match(pass, /^[A-Za-z0-9_-]{43}$/, "32 random bytes, base64url");

  // Stored as its hash only, bound to the user and the direction.
  const [row] = ctx.stores.passes.docs();
  assert.equal(row.hash, sha256(pass));
  assert.equal(row.tz, "100000009");
  assert.equal(row.to, "system");
  assert.equal(new Date(row.expiresAt).getTime(), NOW + 60 * 1000);
  assert.ok(!JSON.stringify(ctx.stores.passes.docs()).includes(pass));

  const first = await toSystem(ctx, pass);
  assert.equal(first.statusCode, 200);
  assert.deepEqual(ctx.signIns, ["100000009"]);
  assert.equal(ctx.stores.passes.docs().length, 0, "deleted on use");

  const again = await toSystem(ctx, pass);
  assert.equal(again.statusCode, 401);
  assert.deepEqual(ctx.signIns, ["100000009"]);

  // Within 60 seconds works; after, it does not.
  const late = (await askSystemPass(ctx, "100000009")).body.pass;
  ctx.clock.t = NOW + 60 * 1000 + 1;
  assert.equal((await toSystem(ctx, late)).statusCode, 401);
  ctx.clock.t = NOW;
  const inTime = (await askSystemPass(ctx, "100000009")).body.pass;
  ctx.clock.t = NOW + 59 * 1000;
  assert.equal((await toSystem(ctx, inTime)).statusCode, 200);

  // Garbage and a missing pass are refused the same way.
  assert.equal((await toSystem(ctx, "x")).statusCode, 401);
  assert.equal((await toSystem(ctx, undefined)).statusCode, 401);
});

test("two requests racing on one pass: only one is let in", async () => {
  const ctx = setup();
  const { pass } = (await askSystemPass(ctx, "100000009")).body;
  const [a, b] = await Promise.all([toSystem(ctx, pass), toSystem(ctx, pass)]);
  assert.deepEqual([a.statusCode, b.statusCode].sort(), [200, 401]);
  assert.equal(ctx.signIns.length, 1);
});

test("a pass for the IT site still needs the email code", async () => {
  const ctx = setup();
  const issued = await askItPass(ctx, "100000009");
  assert.equal(issued.statusCode, 200);
  assert.equal(ctx.stores.passes.docs()[0].to, "it");

  const r = await toIt(ctx, issued.body.pass);
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.message, GENERIC_LOGIN_MESSAGE);
  // The IT site needs the ID number for the code step.
  assert.equal(r.body.tz, "100000009");
  assert.equal(r.cookies.length, 0, "no IT session from the pass alone");
  assert.deepEqual(ctx.sent, [{ to: "it.both@example.com", code: "123456" }]);
  assert.equal(ctx.signIns.length, 0);

  const wrong = await verify(ctx, "100000009", "000000");
  assert.equal(wrong.statusCode, 400);
  const ok = await verify(ctx, "100000009", "123456");
  assert.equal(ok.statusCode, 200);
  assert.ok(ok.cookies.find((c) => c.name === IT_COOKIE));

  // Used: a second try sends nothing.
  ctx.sent.length = 0;
  const reused = await toIt(ctx, issued.body.pass);
  assert.equal(reused.body.message, GENERIC_LOGIN_MESSAGE);
  assert.equal(reused.body.tz, undefined);
  assert.equal(ctx.sent.length, 0);
});

test("a pass for the IT site goes through the same code gates as the password login", async () => {
  // Blocked after the pass was issued: no code.
  const ctx = setup();
  const { pass } = (await askItPass(ctx, "100000009")).body;
  userOf(ctx, "100000009").itBlockedAt = new Date(NOW);
  assert.equal((await toIt(ctx, pass)).body.message, GENERIC_LOGIN_MESSAGE);
  assert.equal(ctx.sent.length, 0);

  // Locked: no code.
  const locked = setup();
  const p2 = (await askItPass(locked, "100000009")).body.pass;
  userOf(locked, "100000009").lockedAt = new Date(NOW);
  await toIt(locked, p2);
  assert.equal(locked.sent.length, 0);

  // No real email: no code.
  const noMail = setup();
  const p3 = (await askItPass(noMail, "100000041")).body.pass;
  await toIt(noMail, p3);
  assert.equal(noMail.sent.length, 0);

  // Five wrong codes in the last ten minutes: no new code.
  const tries = setup();
  await tries.stores.codes.update({ userTz: "100000009" }, { codeHash: null, attempts: 5, expiresAt: new Date(NOW + 5 * 60 * 1000) });
  const p4 = (await askItPass(tries, "100000009")).body.pass;
  await toIt(tries, p4);
  assert.equal(tries.sent.length, 0);

  // The system account with an expired password: no code. (The system
  // account gets no pass from it-pass; issued directly to pin the shared gate.)
  const expired = setup();
  userOf(expired, SYSTEM_TZ).passwordChangedAt = null;
  const p5 = await expired.passes.issue(SYSTEM_TZ, "it");
  await toIt(expired, p5);
  assert.equal(expired.sent.length, 0);
});

test("a system-account pass to the IT site alerts only once the code is verified", async () => {
  // it-pass refuses the system account (no everyday role); issued directly to
  // pin that the pass path leaves the alert to verify.
  const ctx = setup();
  await toIt(ctx, await ctx.passes.issue(SYSTEM_TZ, "it"));
  assert.deepEqual(ctx.sent, [{ to: SYSTEM_EMAIL, code: "123456" }]);
  assert.equal(ctx.alerts.length, 0);
  assert.equal(ctx.audits.filter((a) => a.row.action === "sign_in").length, 0);

  await verify(ctx, SYSTEM_TZ, "123456");
  assert.equal(ctx.alerts.length, 1);
  assert.equal(ctx.audits.filter((a) => a.row.action === "sign_in").length, 1);
});

test("a pass use is audited", async () => {
  const ctx = setup();
  await toIt(ctx, (await askItPass(ctx, "100000009")).body.pass);
  await toSystem(ctx, (await askSystemPass(ctx, "100000009")).body.pass);
  const rows = ctx.audits.map((a) => a.row);
  assert.deepEqual(rows.map((r) => [r.module, r.action, r.targetType, r.targetId]), [
    ["it", "pass_to_it", "user", "100000009"],
    ["it", "pass_to_system", "user", "100000009"],
  ]);
  assert.equal(ctx.audits[0].req.actor.tz, "100000009");
  assert.equal(ctx.audits[0].req.ip, "203.0.113.5");
});

test("a pass made for one site does not open the other direction", async () => {
  const ctx = setup();
  const itPass = (await askItPass(ctx, "100000009")).body.pass;
  const systemPass = (await askSystemPass(ctx, "100000009")).body.pass;

  assert.equal((await toSystem(ctx, itPass)).statusCode, 401);
  assert.equal(ctx.signIns.length, 0);
  const r = await toIt(ctx, systemPass);
  assert.equal(r.body.message, GENERIC_LOGIN_MESSAGE);
  assert.equal(r.body.tz, undefined);
  assert.equal(ctx.sent.length, 0);

  // A pass shown to the wrong site is spent: it no longer works where it belonged.
  await toIt(ctx, itPass);
  assert.equal(ctx.sent.length, 0);
  assert.equal((await toSystem(ctx, systemPass)).statusCode, 401);
});

test("no pass for a user who is not IT, or IT without an everyday role", async () => {
  const ctx = setup();
  // Everyday → IT: only an IT user who is not blocked and has an everyday role.
  assert.equal((await askItPass(ctx, "100000025")).statusCode, 403);
  assert.equal((await askItPass(ctx, "100000033")).statusCode, 403);
  // IT with no everyday role, holding an everyday session: no pass.
  assert.equal((await askItPass(ctx, "100000017")).statusCode, 403);
  // The system account is IT with no everyday role: no pass either.
  assert.equal((await askItPass(ctx, SYSTEM_TZ)).statusCode, 403);
  // IT → everyday: only a user with an everyday role.
  assert.equal((await askSystemPass(ctx, "100000017")).statusCode, 403);
  assert.equal((await askSystemPass(ctx, SYSTEM_TZ)).statusCode, 403);
  assert.equal(ctx.stores.passes.docs().length, 0);

  // Both sides: both passes.
  assert.equal((await askItPass(ctx, "100000009")).statusCode, 200);
  assert.equal((await askSystemPass(ctx, "100000009")).statusCode, 200);
});

/* ================= the everyday sign-in answer, through the real controller ================= */

function loadController(user) {
  const calls = { accessClaims: [], refresh: [], sessions: [], updates: [] };
  const model = {
    async get(filter, room) {
      return { success: true, result: room === "active" && filter.tz === user.tz ? [{ ...user }] : [] };
    },
    async update(filter, patch) { calls.updates.push(patch); Object.assign(user, patch); return { success: true, result: user }; },
    async updateExisting(filter, patch) { Object.assign(user, patch); return { success: true, result: user }; },
    async addRefreshHash(tz, hash, max, clearLegacy, device) { calls.sessions.push({ tz, hash, device }); },
    async dropRefreshHash() {},
    async keepOnlyRefreshHash() {},
  };
  const deps = {
    bcryptjs: bcrypt,
    jsonwebtoken: {},
    path,
    "./User.model": { UserModelDef: model },
    "../../utils/otp": require("../utils/otp"),
    "../../utils/sendEmail": {},
    "../../utils/jwt": {
      signAccessToken: (claims) => { calls.accessClaims.push(claims); return claims.scope ? "scoped" : "access"; },
      signRefreshToken: () => "refresh-1",
      setRefreshCookie(r, token) { calls.refresh.push(token); r.refreshCookie = token; },
      clearRefreshCookie() {},
      sha256: (v) => `sha:${v}`,
      computeAccessExpMsFromNow: () => 1000,
    },
    "../../utils/textEncoding": require("../utils/textEncoding"),
    "../../utils/permissions": require("../utils/permissions"),
    "../../utils/permissionRules": require("../utils/permissionRules"),
    "../../utils/israeliId": require("../utils/israeliId"),
    "../../utils/tourState": require("../utils/tourState"),
    "../../utils/loginLockout": require("../utils/loginLockout"),
    "../../utils/systemPassword": require("../utils/systemPassword"),
    "../../utils/refreshSessions": require("../utils/refreshSessions"),
    "../../middleware/logger": { logWithSource() {} },
    "./passwordCrypto": {
      encryptPassword: (v) => `enc:${v}`,
      decryptPassword: (v) => String(v).replace(/^enc:/, ""),
      isEncrypted: (v) => typeof v === "string" && v.startsWith("enc:"),
      safeEqual: (a, b) => a === b,
    },
    "../UploadFile/file": {},
    "../Storage/Storage.controller": {
      buildUserStorageFolder: () => "folder",
      ensureUserStorageFolder: async () => {},
      syncStorageViewPermissionsForUser: async () => {},
    },
    "../Notification/Notification.controller": {},
    ...require("./helpers/alertEventsStub").noopAlertDeps,
    ...auditStub().deps,
  };
  const filename = path.join(__dirname, "../Entities/User/User.controller.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    process: { env: { ...process.env, SYSTEM_ADMIN_TZ: SYSTEM_TZ } },
    require(name) {
      if (!Object.hasOwn(deps, name) && Object.hasOwn(live.deps, name)) return live.deps[name];
      assert.ok(Object.hasOwn(deps, name), `Unexpected dependency: ${name}`);
      return deps[name];
    },
  }, { filename });
  return { c: module.exports, calls };
}

const strip = (body) => JSON.parse(JSON.stringify(body));

test("a pass for the everyday app signs in without a code", async () => {
  const both = () => ({ ...seedUsers()[0], storageFolder: "f" });

  // The answer a password login gives.
  const byPassword = loadController(both());
  const pwRes = res();
  await byPassword.c.login({ body: { tz: "100000009", password: PASSWORD }, headers: {}, cookies: {} }, pwRes);
  assert.equal(pwRes.statusCode, 200, JSON.stringify(pwRes.body));

  // The same answer through a pass.
  const byPass = loadController(both());
  const ctx = setup({ users: seedUsers().map((u) => ({ ...u, storageFolder: "f" })), signInEveryday: byPass.c.signInWithoutPassword });
  const { pass } = (await askSystemPass(ctx, "100000009")).body;
  const r = await toSystem(ctx, pass);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepEqual(strip(r.body), strip(pwRes.body));
  assert.equal(r.body.accessToken, "access");
  assert.equal(r.refreshCookie, "refresh-1", "refresh cookie set");
  assert.equal(byPass.calls.sessions.length, 1, "a device session is started");
  assert.ok(byPass.calls.accessClaims[0].sid);
  assert.equal(ctx.sent.length, 0, "no email code");
});

test("a pass to the everyday app honours the lockout and an expired system password", async () => {
  // Locked since the pass was issued: the everyday locked answer.
  const lockedUser = { ...seedUsers()[0], lockedAt: new Date(NOW) };
  const locked = loadController(lockedUser);
  const ctx = setup({ signInEveryday: locked.c.signInWithoutPassword });
  const { pass } = (await askSystemPass(ctx, "100000009")).body;
  userOf(ctx, "100000009").lockedAt = new Date(NOW);
  const r = await toSystem(ctx, pass);
  assert.equal(r.statusCode, 423);
  assert.equal(r.body.code, "ACCOUNT_LOCKED");
  assert.equal(locked.calls.refresh.length, 0);

  // The shared tail gives the password-change scope for an expired system password.
  const systemUser = { ...seedUsers()[5], roles: ["ادارة"], passwordChangedAt: null };
  const sys = loadController(systemUser);
  const r2 = res();
  await sys.c.signInWithoutPassword({ headers: {}, ip: "203.0.113.5" }, r2, systemUser, "active");
  assert.equal(r2.statusCode, 200);
  assert.equal(r2.body.mustChangePassword, true);
  assert.equal(r2.body.accessToken, "scoped");
  assert.equal(sys.calls.refresh.length, 0, "no refresh cookie");
});

/* ================= wiring ================= */

const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

test("the pass routes are mounted behind the right guards and rate limits", () => {
  const authRoute = read("Entities/User/Auth.route.js");
  assert.match(authRoute, /router\.post\(\s*['"]\/login-pass['"]\s*,\s*authRateLimit\s*,/);
  assert.match(authRoute, /router\.post\(\s*['"]\/it-pass['"]\s*,\s*requireAuth\s*,\s*loadActor\s*,/);
  const itRoute = read("Entities/It/It.route.js");
  assert.match(itRoute, /router\.post\(\s*"\/login-pass"\s*,\s*loginLimit\s*,/);
  assert.match(itRoute, /router\.post\(\s*"\/system-pass"\s*,\s*requireIt\s*,/);
  assert.match(read("server.js"), /SitePass\.model'\)\.ensureSitePassIndexes\(\)/);
});

test("the pass collection: unique hash, removed by MongoDB once expired", () => {
  assert.deepEqual(SITE_PASS_INDEXES, [
    { key: { hash: 1 }, options: { unique: true } },
    { key: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
  ]);
});

test("a missing IT_SESSION_SECRET does not spend the pass or write an audit row", async () => {
  const ctx = setup();
  const { pass } = (await askItPass(ctx, "100000009")).body;
  const saved = process.env.IT_SESSION_SECRET;
  delete process.env.IT_SESSION_SECRET;
  try {
    const r = await toIt(ctx, pass);
    assert.equal(r.body.message, GENERIC_LOGIN_MESSAGE);
    assert.equal(r.body.tz, undefined);
  } finally {
    process.env.IT_SESSION_SECRET = saved;
  }
  assert.equal(ctx.stores.passes.docs().length, 1, "the pass is still there");
  assert.equal(ctx.audits.length, 0);
  assert.equal(ctx.sent.length, 0);
  // Once the secret is back, the same pass works.
  await toIt(ctx, pass);
  assert.equal(ctx.sent.length, 1);
});
