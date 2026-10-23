const assert = require("node:assert/strict");
const test = require("node:test");
const jwt = require("jsonwebtoken");

process.env.PASSWORD_ENC_KEY_HEX = process.env.PASSWORD_ENC_KEY_HEX || "0".repeat(64);
process.env.SPORT_SESSION_SECRET = "test-sport-session-secret";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

const { createSportAuth, GENERIC_CODE_MESSAGE } = require("../Entities/SportPortal/SportPortal.auth");
const { sha256 } = require("../utils/jwt");
const { requireAuth } = require("../middleware/authMiddleware");

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
      return { success: true, result: hit || null };
    },
    async delete(f) { docs = docs.filter((d) => !matches(d, f)); return { success: true }; },
  };
}

const res = () => ({
  statusCode: 200, body: undefined, cookies: [], cleared: [],
  status(c) { this.statusCode = c; return this; },
  json(v) { this.body = v; return this; },
  cookie(name, value, options) { this.cookies.push({ name, value, options }); return this; },
  clearCookie(name, options) { this.cleared.push({ name, options }); return this; },
});

function setup({ students, players, codes } = {}) {
  const clock = { t: Date.parse("2026-01-01T10:00:00Z") };
  const sent = [];
  const logs = [];
  const stores = {
    students: store(students || [
      { _id: "s1", tz: "100000009", email: "one@example.com" },
      { _id: "s2", tz: "100000017", email: "" },
      { _id: "s3", tz: "100000025", email: "three@example.com" },
      { _id: "s4", tz: "100000033", email: "dup-a@example.com" },
      { _id: "s5", tz: "100000033", email: "dup-b@example.com" },
    ]),
    players: store(players || [
      { studentId: "s1", sportId: "x" }, { studentId: "s2", sportId: "x" },
      { studentId: "s4", sportId: "x" }, { studentId: "s5", sportId: "x" },
    ]),
    codes: store(codes || []),
  };
  const auth = createSportAuth({
    ...stores,
    sendCode: async (to, code) => { sent.push({ to, code }); },
    makeCode: () => "123456",
    log: (...args) => logs.push(args),
    now: () => clock.t,
  });
  return { auth, stores, sent, logs, clock };
}

const BAD = { ok: false, message: "الرمز غير صحيح أو انتهت صلاحيته" };
const ask = async (auth, tz) => { const r = res(); await auth.requestCode({ body: { tz } }, r); return r; };
const verify = async (auth, tz, code) => { const r = res(); await auth.verify({ body: { tz, code } }, r); return r; };
const GENERIC = { ok: true, message: GENERIC_CODE_MESSAGE };

test("unknown, duplicated, email-less and non-sport IDs all get the generic message and no email", async () => {
  const { auth, sent } = setup();
  for (const tz of ["999999999", "100000033", "100000017", "100000025", ""]) {
    const r = await ask(auth, tz);
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.body, GENERIC);
  }
  assert.equal(sent.length, 0);
});

test("duplicated ID is logged without the tz", async () => {
  const { auth, logs } = setup();
  await ask(auth, "100000033");
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], "SportPortal.requestCode");
  assert.equal(logs[0][1].message, "duplicate student tz");
  assert.deepEqual(logs[0][2].ids.sort(), ["s4", "s5"]);
  assert.ok(!JSON.stringify(logs).includes("100000033"));
});

test("a valid student gets one email, and the stored code is a hash", async () => {
  const { auth, stores, sent } = setup();
  const r = await ask(auth, "100000009");
  assert.deepEqual(r.body, GENERIC);
  assert.deepEqual(sent, [{ to: "one@example.com", code: "123456" }]);
  const [row] = stores.codes.docs();
  assert.equal(row.codeHash, sha256("123456"));
  assert.ok(!JSON.stringify(row).includes("123456"));
});

test("a second request within 60 seconds sends nothing", async () => {
  const { auth, sent, clock } = setup();
  await ask(auth, "100000009");
  clock.t += 30 * 1000;
  const r = await ask(auth, "100000009");
  assert.deepEqual(r.body, GENERIC);
  assert.equal(sent.length, 1);
  clock.t += 31 * 1000;
  await ask(auth, "100000009");
  assert.equal(sent.length, 2);
});

test("five wrong codes lock the ID for 10 minutes", async () => {
  const { auth, clock } = setup();
  await ask(auth, "100000009");
  for (let i = 0; i < 4; i++) {
    const r = await verify(auth, "100000009", "000000");
    assert.equal(r.statusCode, 400);
    assert.deepEqual(r.body, BAD);
  }
  // The fifth wrong code locks; locked answers exactly like a wrong code.
  const fifth = await verify(auth, "100000009", "000000");
  assert.equal(fifth.statusCode, 400);
  assert.deepEqual(fifth.body, BAD);
  // Even the right code is refused while locked.
  const locked = await verify(auth, "100000009", "123456");
  assert.equal(locked.statusCode, 400);
  assert.deepEqual(locked.body, BAD);
  assert.equal(locked.cookies.length, 0);
  clock.t += 10 * 60 * 1000 + 1;
  // The lock has passed, but the code itself expired by now (10 minutes).
  const after = await verify(auth, "100000009", "123456");
  assert.equal(after.statusCode, 400);
});

test("an expired code is refused", async () => {
  const { auth, clock } = setup();
  await ask(auth, "100000009");
  clock.t += 10 * 60 * 1000 + 1;
  const r = await verify(auth, "100000009", "123456");
  assert.equal(r.statusCode, 400);
  assert.deepEqual(r.body, { ok: false, message: "الرمز غير صحيح أو انتهت صلاحيته" });
  assert.equal(r.cookies.length, 0);
});

test("a correct code sets a host-only httpOnly cookie on /api/sport-portal", async () => {
  const { auth, stores } = setup();
  await ask(auth, "100000009");
  const r = await verify(auth, "100000009", "123456");
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, { ok: true });
  assert.equal(r.cookies.length, 1);
  const { name, value, options } = r.cookies[0];
  assert.equal(name, "tamheed_sport");
  assert.equal(options.httpOnly, true);
  assert.equal(options.path, "/api/sport-portal");
  assert.equal(options.sameSite, "Lax");
  assert.equal(options.domain, undefined);
  assert.equal(options.maxAge, 30 * 24 * 60 * 60 * 1000);
  const payload = jwt.verify(value, process.env.SPORT_SESSION_SECRET);
  assert.equal(payload.sub, "s1");
  assert.equal(payload.typ, "sport-student");
  assert.equal(stores.codes.docs().length, 0, "the code is cleared on success");
  // Replaying the same code fails.
  assert.equal((await verify(auth, "100000009", "123456")).statusCode, 400);

  // Through a real Express serializer: no Domain attribute.
  const express = require("express");
  const app = express();
  app.get("/", (req, rs) => { rs.cookie(name, value, options); rs.end(); });
  const server = app.listen(0);
  try {
    const out = await fetch(`http://127.0.0.1:${server.address().port}/`);
    const header = out.headers.get("set-cookie");
    assert.ok(!/Domain=/i.test(header));
    assert.match(header, /HttpOnly/i);
    assert.match(header, /Path=\/api\/sport-portal/);
    assert.match(header, /SameSite=Lax/i);
  } finally { server.close(); }
});

test("sign-in fails closed without SPORT_SESSION_SECRET", async () => {
  const { auth, logs } = setup();
  await ask(auth, "100000009");
  const saved = process.env.SPORT_SESSION_SECRET;
  delete process.env.SPORT_SESSION_SECRET;
  try {
    const r = await verify(auth, "100000009", "123456");
    assert.equal(r.statusCode, 500);
    assert.equal(r.cookies.length, 0);
    assert.equal(logs.length, 1);
  } finally { process.env.SPORT_SESSION_SECRET = saved; }
});

test("logout clears the cookie on the same path", () => {
  const { auth } = setup();
  const r = res();
  auth.logout({}, r);
  assert.deepEqual(r.body, { ok: true });
  assert.equal(r.cleared[0].name, "tamheed_sport");
  assert.equal(r.cleared[0].options.path, "/api/sport-portal");
});

const guard = async (auth, req) => {
  const r = res();
  let called = false;
  await auth.requireSportStudent(req, r, () => { called = true; });
  return { r, called };
};

test("requireSportStudent accepts a valid sport cookie and sets req.sportStudent", async () => {
  const { auth } = setup();
  const token = jwt.sign({ sub: "s1", typ: "sport-student" }, process.env.SPORT_SESSION_SECRET);
  const req = { headers: {}, cookies: { tamheed_sport: token } };
  const { called } = await guard(auth, req);
  assert.equal(called, true);
  assert.equal(req.sportStudent._id, "s1");
});

test("requireSportStudent refuses a staff Bearer token and a staff refresh cookie", async () => {
  const { auth } = setup();
  const access = jwt.sign({ id: "s1", sub: "s1", typ: "sport-student" }, process.env.JWT_ACCESS_SECRET);
  const refresh = jwt.sign({ id: "s1", sub: "s1", typ: "sport-student" }, process.env.JWT_REFRESH_SECRET);
  for (const req of [
    { headers: { authorization: `Bearer ${access}` }, cookies: {} },
    { headers: {}, cookies: { refresh } },
    { headers: { authorization: `Bearer ${access}` }, cookies: { refresh } },
  ]) {
    const { r, called } = await guard(auth, req);
    assert.equal(called, false);
    assert.equal(r.statusCode, 401);
    assert.deepEqual(r.body, { ok: false, code: "SPORT_AUTH" });
  }
});

test("requireSportStudent refuses a token signed with JWT_ACCESS_SECRET", async () => {
  const { auth } = setup();
  const token = jwt.sign({ sub: "s1", typ: "sport-student" }, process.env.JWT_ACCESS_SECRET);
  const { r, called } = await guard(auth, { headers: {}, cookies: { tamheed_sport: token } });
  assert.equal(called, false);
  assert.equal(r.statusCode, 401);
  assert.deepEqual(r.body, { ok: false, code: "SPORT_AUTH" });
});

test("requireSportStudent refuses a wrong typ and a student who left the sport section", async () => {
  const { auth } = setup();
  const secret = process.env.SPORT_SESSION_SECRET;
  for (const token of [
    jwt.sign({ sub: "s1", typ: "other" }, secret),
    jwt.sign({ sub: "s3", typ: "sport-student" }, secret),
    jwt.sign({ sub: "gone", typ: "sport-student" }, secret),
  ]) {
    const { r, called } = await guard(auth, { headers: {}, cookies: { tamheed_sport: token } });
    assert.equal(called, false);
    assert.equal(r.statusCode, 401);
    assert.deepEqual(r.body, { ok: false, code: "SPORT_AUTH" });
  }
});

test("a sport session cookie does not open /api/student", async () => {
  const token = jwt.sign({ sub: "s1", typ: "sport-student" }, process.env.SPORT_SESSION_SECRET);
  const express = require("express");
  const cookieParser = require("cookie-parser");
  const app = express();
  app.use(cookieParser());
  // The real Student router: its first guard is the real requireAuth.
  app.use("/api/student", require("../Entities/Student/Student.route"));
  const server = app.listen(0);
  try {
    const out = await fetch(`http://127.0.0.1:${server.address().port}/api/student/`, {
      headers: { Cookie: `tamheed_sport=${token}` },
    });
    assert.equal(out.status, 401);
    assert.equal((await out.json()).code, "NO_TOKEN");
  } finally { server.close(); }
});

test("request-code does not wait for the mail", async () => {
  const { stores } = setup();
  const auth = createSportAuth({
    ...stores, sendCode: () => new Promise(() => {}), makeCode: () => "123456", log() {},
  });
  const r = await Promise.race([ask(auth, "100000009"), new Promise((ok) => setTimeout(() => ok("timeout"), 500))]);
  assert.notEqual(r, "timeout");
  assert.deepEqual(r.body, GENERIC);
});

test("a failing mailer is logged and the answer stays generic", async () => {
  const { stores, logs } = setup();
  const auth = createSportAuth({
    ...stores, sendCode: async () => { throw new Error("smtp down"); }, makeCode: () => "123456", log: (...a) => logs.push(a),
  });
  const r = await ask(auth, "100000009");
  assert.deepEqual(r.body, GENERIC);
  await new Promise((ok) => setImmediate(ok));
  assert.equal(logs.length, 1);
});

test("re-requesting a code does not reset the wrong-guess count", async () => {
  const { auth, clock } = setup();
  await ask(auth, "100000009");
  for (let i = 0; i < 4; i++) await verify(auth, "100000009", "000000");
  clock.t += 61 * 1000;
  await ask(auth, "100000009");
  const r = await verify(auth, "100000009", "000000"); // fifth guess in total -> lock
  assert.equal(r.statusCode, 400);
  const right = await verify(auth, "100000009", "123456");
  assert.equal(right.statusCode, 400);
  assert.equal(right.cookies.length, 0);
});

test("attempts restart once a lock has run out", async () => {
  const { auth, clock } = setup();
  await ask(auth, "100000009");
  for (let i = 0; i < 5; i++) await verify(auth, "100000009", "000000");
  clock.t += 10 * 60 * 1000 + 1;
  await ask(auth, "100000009");
  assert.equal((await verify(auth, "100000009", "000000")).statusCode, 400);
  assert.equal((await verify(auth, "100000009", "123456")).statusCode, 200);
});

test("verify refuses a code that is not 6 digits without burning an attempt", async () => {
  const { auth, stores } = setup();
  await ask(auth, "100000009");
  for (const code of ["12345", "1234567", "abcdef", "12 456", ""]) {
    const r = await verify(auth, "100000009", code);
    assert.equal(r.statusCode, 400);
    assert.deepEqual(r.body, BAD);
  }
  assert.equal(stores.codes.docs()[0].attempts, 0);
});

test("request-code without SPORT_SESSION_SECRET is generic, logs, and creates nothing", async () => {
  const { auth, stores, sent, logs } = setup();
  const saved = process.env.SPORT_SESSION_SECRET;
  delete process.env.SPORT_SESSION_SECRET;
  try {
    const r = await ask(auth, "100000009");
    assert.deepEqual(r.body, GENERIC);
    assert.equal(stores.codes.docs().length, 0);
    assert.equal(sent.length, 0);
    assert.equal(logs.length, 1);
  } finally { process.env.SPORT_SESSION_SECRET = saved; }
});

test("rateLimit buckets by req.ip, so a spoofed X-Forwarded-For gets no fresh bucket", () => {
  const { rateLimit } = require("../middleware/rateLimit");
  const limit = rateLimit({ windowMs: 60000, max: 2, scope: "spoof-test" });
  const hit = (xff) => {
    const r = res();
    r.set = () => r;
    let passed = false;
    limit({ ip: "9.9.9.9", get: () => xff }, r, () => { passed = true; });
    return passed;
  };
  assert.equal(hit("1.1.1.1"), true);
  assert.equal(hit("2.2.2.2"), true);
  assert.equal(hit("3.3.3.3"), false);
});
