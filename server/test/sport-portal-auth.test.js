const assert = require("node:assert/strict");
const test = require("node:test");
const jwt = require("jsonwebtoken");

process.env.PASSWORD_ENC_KEY_HEX = process.env.PASSWORD_ENC_KEY_HEX || "0".repeat(64);
process.env.SPORT_SESSION_SECRET = "test-sport-session-secret";
process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

const { createSportAuth, GENERIC_CODE_MESSAGE, NOT_IN_SPORT_MESSAGE, NO_EMAIL_MESSAGE } = require("../Entities/SportPortal/SportPortal.auth");
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
    ensureSport: async () => ({ _id: "x" }),
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

test("a number with no player in the sport department, or no email, is told so and gets no email (owner, 2026-11-03)", async () => {
  const { auth, sent } = setup();
  for (const tz of ["999999999", "100000025", ""]) {
    const r = await ask(auth, tz);
    assert.equal(r.statusCode, 404, tz);
    assert.deepEqual(r.body, { ok: false, code: "NOT_IN_SPORT", message: NOT_IN_SPORT_MESSAGE }, tz);
  }
  const noMail = await ask(auth, "100000017");
  assert.equal(noMail.statusCode, 404);
  assert.deepEqual(noMail.body, { ok: false, code: "NO_EMAIL", message: NO_EMAIL_MESSAGE });
  // Two students with one number: a data fault, the generic answer.
  assert.deepEqual((await ask(auth, "100000033")).body, GENERIC);
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
  assert.equal(options.maxAge, 365 * 24 * 60 * 60 * 1000); // a year, renewed on visits (owner, 2026-11-01)
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
    ...stores, ensureSport: async () => ({ _id: "x" }), sendCode: () => new Promise(() => {}), makeCode: () => "123456", log() {},
  });
  const r = await Promise.race([ask(auth, "100000009"), new Promise((ok) => setTimeout(() => ok("timeout"), 500))]);
  assert.notEqual(r, "timeout");
  assert.deepEqual(r.body, GENERIC);
});

test("a failing mailer is logged and the answer stays generic", async () => {
  const { stores, logs } = setup();
  const auth = createSportAuth({
    ...stores, ensureSport: async () => ({ _id: "x" }), sendCode: async () => { throw new Error("smtp down"); }, makeCode: () => "123456", log: (...a) => logs.push(a),
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

test("a student whose only player row belongs to another sport cannot sign in", async () => {
  const { auth, sent, stores } = setup({
    students: [{ _id: "s9", tz: "100000041", email: "old@example.com" }],
    players: [{ studentId: "s9", sportId: "old" }],
  });
  const r = await ask(auth, "100000041");
  assert.equal(r.body.code, "NOT_IN_SPORT");
  assert.equal(sent.length, 0);
  assert.equal(stores.codes.docs().length, 0);

  // Even with a valid stored code, verify refuses and sets no cookie.
  stores.codes.docs().push({ _id: "c1", studentId: "s9", codeHash: sha256("123456"), expiresAt: new Date(Date.parse("2026-01-01T10:05:00Z")), attempts: 0, lockedUntil: null });
  const v = await verify(auth, "100000041", "123456");
  assert.equal(v.statusCode, 400);
  assert.equal(v.cookies.length, 0);
});

test("a session of a student with no football row is refused with 401", async () => {
  const { auth } = setup({
    students: [{ _id: "s9", tz: "100000041", email: "old@example.com" }],
    players: [{ studentId: "s9", sportId: "old" }],
  });
  const token = jwt.sign({ sub: "s9", typ: "sport-student" }, process.env.SPORT_SESSION_SECRET, { algorithm: "HS256" });
  const r = res();
  let passed = false;
  await auth.requireSportStudent({ cookies: { tamheed_sport: token } }, r, () => { passed = true; });
  assert.equal(passed, false);
  assert.equal(r.statusCode, 401);
});

// The owner's rule (2026-11-01): a player stays signed in until he signs out
// or a sports manager signs him out, like a phone app.
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const signAt = (sub, atMs) => jwt.sign({ sub, typ: "sport-student", iat: Math.floor(atMs / 1000) }, process.env.SPORT_SESSION_SECRET);

test("a sign-in lasts a year", async () => {
  const { auth } = setup();
  await ask(auth, "100000009");
  const r = await verify(auth, "100000009", "123456");
  assert.equal(r.cookies[0].options.maxAge, YEAR_MS);
  const p = jwt.decode(r.cookies[0].value);
  assert.equal(p.exp - p.iat, YEAR_MS / 1000);
});

test("a visit more than a day after the cookie was made renews it for another year", async () => {
  const { auth, clock } = setup();
  const { r, called } = await guard(auth, { headers: {}, cookies: { tamheed_sport: signAt("s1", clock.t - 2 * 24 * 60 * 60 * 1000) } });
  assert.equal(called, true);
  assert.equal(r.cookies.length, 1);
  assert.equal(r.cookies[0].name, "tamheed_sport");
  assert.equal(r.cookies[0].options.maxAge, YEAR_MS);
  assert.equal(r.cookies[0].options.path, "/api/sport-portal");
  const p = jwt.verify(r.cookies[0].value, process.env.SPORT_SESSION_SECRET);
  assert.equal(p.sub, "s1");
  assert.equal(p.iat, Math.floor(clock.t / 1000));
});

test("a visit within a day of the cookie leaves it as it is", async () => {
  const { auth, clock } = setup();
  const { r, called } = await guard(auth, { headers: {}, cookies: { tamheed_sport: signAt("s1", clock.t - 60 * 60 * 1000) } });
  assert.equal(called, true);
  assert.equal(r.cookies.length, 0);
});

test("a session older than the student's sportSignedOutAt is refused; a newer one is not", async () => {
  const at = Date.parse("2026-01-01T09:00:00Z");
  const { auth } = setup({ students: [{ _id: "s1", tz: "100000009", email: "one@example.com", sportSignedOutAt: new Date(at) }] });
  const old = await guard(auth, { headers: {}, cookies: { tamheed_sport: signAt("s1", at - 1000) } });
  assert.equal(old.called, false);
  assert.equal(old.r.statusCode, 401);
  const after = await guard(auth, { headers: {}, cookies: { tamheed_sport: signAt("s1", at) } });
  assert.equal(after.called, true);
});

test("signOutPlayer stamps sportSignedOutAt on the student", async () => {
  const { auth, stores, clock } = setup();
  const r = res();
  await auth.signOutPlayer({ params: { studentId: "s1" } }, r);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, { ok: true });
  const s1 = stores.students.docs().find((d) => d._id === "s1");
  assert.equal(new Date(s1.sportSignedOutAt).getTime(), clock.t);
});

test("signOutPlayer of an unknown student is 404 and writes nothing", async () => {
  const { auth, stores } = setup();
  const r = res();
  await auth.signOutPlayer({ params: { studentId: "nobody" } }, r);
  assert.equal(r.statusCode, 404);
  assert.equal(stores.students.docs().length, 5);
});

// Sign-in card (owner, 2026-11-01): young players have no email. A sports
// manager prints a card with a QR code; scanning it signs the phone in. The
// card holds a long random token; only its hash is stored, and a new card
// cancels the old one.
const BAD_CARD = { ok: false, message: "البطاقة غير صالحة. اطلب بطاقة جديدة من المرشد" };
function cardSetup() {
  const ctx = setup();
  let n = 0;
  ctx.auth = createSportAuth({
    ...ctx.stores,
    ensureSport: async () => ({ _id: "x" }),
    log: (...args) => ctx.logs.push(args),
    now: () => ctx.clock.t,
    sportUrl: () => "https://sport.test",
    makeCardToken: () => `card-token-${(n += 1)}-${"x".repeat(30)}`,
  });
  return ctx;
}
const issue = async (auth, studentId) => { const r = res(); await auth.issueCard({ params: { studentId }, actor: { tz: "m1" } }, r); return r; };
const useCard = async (auth, token) => { const r = res(); await auth.signInWithCard({ body: { token } }, r); return r; };

test("a sign-in card is a QR of the sport site link with the token; only its hash is stored", async () => {
  const { auth, stores } = cardSetup();
  const r = await issue(auth, "s2");
  assert.equal(r.statusCode, 200);
  const token = `card-token-1-${"x".repeat(30)}`;
  assert.equal(r.body.url, `https://sport.test/#card=${token}`);
  assert.match(r.body.svg, /^<svg/);
  assert.match(r.body.png, /^data:image\/png;base64,/);
  const student = stores.students.docs().find((d) => d._id === "s2");
  assert.equal(student.sportCardHash, sha256(token));
  assert.equal(JSON.stringify(student).includes(token), false);
});

test("scanning the card signs the phone in, even for a player without email", async () => {
  const { auth } = cardSetup();
  const { body } = await issue(auth, "s2");
  const r = await useCard(auth, body.url.split("#card=")[1]);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body, { ok: true });
  assert.equal(r.cookies[0].name, "tamheed_sport");
  assert.equal(jwt.decode(r.cookies[0].value).sub, "s2");
});

test("a new card cancels the old one", async () => {
  const { auth } = cardSetup();
  const first = (await issue(auth, "s2")).body.url.split("#card=")[1];
  const second = (await issue(auth, "s2")).body.url.split("#card=")[1];
  assert.deepEqual((await useCard(auth, first)).body, BAD_CARD);
  assert.equal((await useCard(auth, second)).statusCode, 200);
});

test("an unknown, empty or short token is refused without a session", async () => {
  const { auth } = cardSetup();
  for (const token of ["nope-nope-nope-nope-nope-nope-nope", "", "short", undefined]) {
    const r = await useCard(auth, token);
    assert.equal(r.statusCode, 400);
    assert.deepEqual(r.body, BAD_CARD);
    assert.equal(r.cookies.length, 0);
  }
});

test("the card of a student who is no longer a player is refused", async () => {
  const { auth, stores } = cardSetup();
  const token = (await issue(auth, "s1")).body.url.split("#card=")[1];
  await stores.players.delete({ studentId: "s1" });
  assert.deepEqual((await useCard(auth, token)).body, BAD_CARD);
});

test("a card is issued only for a player: unknown student and non-player answer 404", async () => {
  const { auth } = cardSetup();
  assert.equal((await issue(auth, "nobody")).statusCode, 404);
  assert.equal((await issue(auth, "s3")).statusCode, 404); // a student, not a player
});

// Passkeys (2026-11-01): a manager's sign-out also removes the passkeys saved
// on the player's phones, so a lost phone cannot sign in with a fingerprint.
test("signOutPlayer removes the player's saved passkeys too", async () => {
  const { auth, stores } = setup();
  await stores.students.updateExisting({ _id: "s1" }, { sportPasskeys: [{ id: "c1", publicKey: "AQID", counter: 0 }] });
  await auth.signOutPlayer({ params: { studentId: "s1" } }, res());
  assert.deepEqual(stores.students.docs().find((d) => d._id === "s1").sportPasskeys, []);
});

test("signIn starts the year-long sport session; isPlayer reads the football row", async () => {
  const { auth } = setup();
  const r = res();
  auth.signIn(r, "s1");
  assert.equal(r.cookies[0].name, "tamheed_sport");
  assert.equal(jwt.decode(r.cookies[0].value).sub, "s1");
  assert.equal(await auth.isPlayer("s1"), true);
  assert.equal(await auth.isPlayer("s3"), false);
});

test("signing in to the sport site has no limit per address", () => {
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "Entities", "SportPortal", "SportPortal.route.js"), "utf8");
  assert.doesNotMatch(source, /rateLimit/);
  assert.ok(source.includes('router.post("/verify", auth.verify)'));
});
