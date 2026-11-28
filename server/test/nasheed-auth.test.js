// The nasheed site's sign-in (owner, 2026-11-27): the Tamheed ID number and
// password, nasheeds.manage, no email code, and its own session cookie on its
// own host. Synthetic values only.
const assert = require("node:assert/strict");
const test = require("node:test");
const jwt = require("jsonwebtoken");

process.env.NASHEED_SESSION_SECRET = "test-nasheed-secret";
process.env.NASHEED_HOST = "nasheed.example.test";

const { createNasheedAuth, LOGIN_REFUSALS } = require("../Entities/Nasheed/Nasheed.auth");
const { createRequireNasheed, requireNasheedHost, NASHEED_COOKIE } = require("../middleware/requireNasheed");

const SYSTEM_TZ = "900000001";
const PASSWORD = "synthetic-pass-1";
const HOST = "nasheed.example.test";

const MANAGER = { _id: "u1", tz: "900000002", firstname: "منشد", lastname: "أ", role: "مرشد", permissionGrants: ["nasheeds.manage"], room: "active" };
const GUIDE = { _id: "u2", tz: "900000003", firstname: "مرشد", lastname: "ب", role: "مرشد", room: "active" };
const LOCKED = { ...MANAGER, _id: "u3", tz: "900000004", lockedAt: "2026-11-01T00:00:00Z" };
const WAITING = { ...MANAGER, _id: "u4", tz: "900000005", room: "waiting" };
const MUST = { ...MANAGER, _id: "u5", tz: "900000006", mustChangePassword: true };
const SYSTEM = { _id: "u6", tz: SYSTEM_TZ, firstname: "System", role: "ادارة", room: "active" };

function users(seed) {
  const docs = seed.map((d) => ({ ...d }));
  return {
    docs,
    async get(filter, room) {
      return { success: true, result: docs.filter((d) => (!room || d.room === room) && Object.entries(filter).every(([k, v]) => String(d[k]) === String(v))).map((d) => ({ ...d })) };
    },
  };
}

function setup(seed = [MANAGER, GUIDE, LOCKED, WAITING, MUST, SYSTEM]) {
  const model = users(seed);
  const failures = [];
  const cleared = [];
  const auth = createNasheedAuth({
    users: model,
    verifyPassword: async (user, room, password) => ({ ok: password === PASSWORD }),
    countFailure: async (req, user) => { failures.push(user.tz); },
    clearFailures: async (user) => { cleared.push(user.tz); },
    systemTz: () => SYSTEM_TZ,
    log: () => {},
  });
  const requireNasheed = createRequireNasheed({ users: model, systemTz: () => SYSTEM_TZ, log: () => {} });
  return { auth, requireNasheed, model, failures, cleared };
}

const res = () => ({
  statusCode: 200, body: undefined, cookies: [], cleared: [],
  status(c) { this.statusCode = c; return this; },
  json(v) { this.body = v; return this; },
  cookie(name, value, options) { this.cookies.push({ name, value, options }); return this; },
  clearCookie(name, options) { this.cleared.push({ name, options }); return this; },
});
const req = (body = {}, extra = {}) => ({ hostname: HOST, body, cookies: {}, ip: "127.0.0.1", path: "/", ...extra });

async function signIn(auth, tz, password = PASSWORD) {
  const r = res();
  await auth.login(req({ tz, password }), r);
  return r;
}

async function guard(requireNasheed, cookie, extra = {}) {
  const r = res();
  const request = req({}, { cookies: cookie ? { [NASHEED_COOKIE]: cookie } : {}, ...extra });
  let passed = false;
  await requireNasheed(request, r, () => { passed = true; });
  return { r, passed, request };
}

test("a staff member with nasheeds.manage signs in and gets the cookie", async () => {
  const { auth } = setup();
  const r = await signIn(auth, MANAGER.tz);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body, { ok: true, user: { name: "منشد أ" } });
  const [cookie] = r.cookies;
  assert.equal(cookie.name, NASHEED_COOKIE);
  assert.equal(cookie.options.httpOnly, true);
  assert.equal(cookie.options.path, "/api/nasheed");
  assert.equal(jwt.verify(cookie.value, "test-nasheed-secret").typ, "nasheed");
});

test("a wrong password counts a failure and answers BAD_LOGIN; an unknown tz too", async () => {
  const { auth, failures } = setup();
  const wrong = await signIn(auth, MANAGER.tz, "nope");
  assert.equal(wrong.statusCode, 401);
  assert.equal(wrong.body.code, "BAD_LOGIN");
  assert.deepEqual(failures, [MANAGER.tz]);
  assert.equal((await signIn(auth, "123456789")).body.code, "BAD_LOGIN");
  assert.equal((await signIn(auth, "")).body.code, "BAD_LOGIN");
  assert.equal(wrong.cookies.length, 0);
});

test("no nasheeds.manage answers NO_ACCESS after the right password", async () => {
  const { auth } = setup();
  const r = await signIn(auth, GUIDE.tz);
  assert.equal(r.statusCode, 403);
  assert.equal(r.body.code, "NO_ACCESS");
  assert.equal(r.body.message, LOGIN_REFUSALS.NO_ACCESS.message);
  assert.equal(r.cookies.length, 0);
});

test("a locked account answers LOCKED; a waiting or suspended one is unknown here", async () => {
  const { auth } = setup();
  assert.equal((await signIn(auth, LOCKED.tz)).body.code, "LOCKED");
  assert.equal((await signIn(auth, WAITING.tz)).body.code, "BAD_LOGIN");
});

test("the system account is refused as BAD_LOGIN, even with the right password", async () => {
  const { auth, failures } = setup();
  const r = await signIn(auth, SYSTEM_TZ);
  assert.equal(r.body.code, "BAD_LOGIN");
  assert.equal(r.cookies.length, 0);
  assert.deepEqual(failures, []);
});

test("mustChangePassword answers PASSWORD_CHANGE with the message to go to the main system", async () => {
  const { auth } = setup();
  const r = await signIn(auth, MUST.tz);
  assert.equal(r.statusCode, 403);
  assert.equal(r.body.code, "PASSWORD_CHANGE");
  assert.equal(r.body.message, "يجب تغيير كلمة المرور أولًا في النظام الرئيسي");
});

test("me answers the name; logout clears the cookie", async () => {
  const { auth, requireNasheed } = setup();
  const cookie = (await signIn(auth, MANAGER.tz)).cookies[0].value;
  const { passed, request } = await guard(requireNasheed, cookie);
  assert.equal(passed, true);
  const me = res();
  await auth.me(request, me);
  assert.deepEqual(me.body, { ok: true, user: { name: "منشد أ" } });
  const out = res();
  await auth.logout(req(), out);
  assert.equal(out.cleared[0].name, NASHEED_COOKIE);
});

test("requireNasheed refuses another host with 404, no or a bad cookie with 401", async () => {
  const { auth, requireNasheed } = setup();
  const cookie = (await signIn(auth, MANAGER.tz)).cookies[0].value;
  const other = await guard(requireNasheed, cookie, { hostname: "example.test" });
  assert.equal(other.r.statusCode, 404);
  assert.equal(other.passed, false);
  assert.equal((await guard(requireNasheed, null)).r.statusCode, 401);
  assert.equal((await guard(requireNasheed, "garbage")).r.statusCode, 401);
  const itToken = jwt.sign({ sub: MANAGER.tz, typ: "it" }, "test-nasheed-secret");
  assert.equal((await guard(requireNasheed, itToken)).r.statusCode, 401);
  const hostCheck = res();
  let next = false;
  requireNasheedHost(req({}, { hostname: "other.test" }), hostCheck, () => { next = true; });
  assert.equal(hostCheck.statusCode, 404);
  assert.equal(next, false);
});

test("requireNasheed refuses a token older than a password change, and a user whose key was revoked or who was locked after sign-in", async () => {
  const { auth, requireNasheed, model } = setup();
  const cookie = (await signIn(auth, MANAGER.tz)).cookies[0].value;
  const user = model.docs.find((d) => d.tz === MANAGER.tz);

  user.passwordChangedAt = new Date(Date.now() + 5000).toISOString();
  const stale = await guard(requireNasheed, cookie);
  assert.equal(stale.r.statusCode, 401);
  assert.equal(stale.r.body.code, "NASHEED_SIGNED_OUT");
  delete user.passwordChangedAt;

  user.permissionRevokes = ["nasheeds.manage"];
  assert.equal((await guard(requireNasheed, cookie)).r.statusCode, 401);
  delete user.permissionRevokes;

  user.lockedAt = "2026-11-27T00:00:00Z";
  assert.equal((await guard(requireNasheed, cookie)).r.statusCode, 401);
  delete user.lockedAt;

  user.room = "noActive";
  assert.equal((await guard(requireNasheed, cookie)).r.statusCode, 401);
  user.room = "active";

  const ok = await guard(requireNasheed, cookie);
  assert.equal(ok.passed, true);
  assert.equal(ok.request.actor.tz, MANAGER.tz);
  assert.ok(ok.request.actor.permissions.has("nasheeds.manage"));
});

test("without NASHEED_SESSION_SECRET sign-in and every guarded request answer 500", async () => {
  const { auth, requireNasheed } = setup();
  const saved = process.env.NASHEED_SESSION_SECRET;
  delete process.env.NASHEED_SESSION_SECRET;
  try {
    assert.equal((await signIn(auth, MANAGER.tz)).statusCode, 500);
    assert.equal((await guard(requireNasheed, "x")).r.statusCode, 500);
  } finally {
    process.env.NASHEED_SESSION_SECRET = saved;
  }
});
