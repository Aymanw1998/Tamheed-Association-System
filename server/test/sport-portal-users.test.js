const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const jwt = require("jsonwebtoken");

process.env.PASSWORD_ENC_KEY_HEX = process.env.PASSWORD_ENC_KEY_HEX || "0".repeat(64);
process.env.SPORT_SESSION_SECRET = "test-sport-session-secret";

const { createSportAuth, NO_EMAIL_MESSAGE } = require("../Entities/SportPortal/SportPortal.auth");
const { createSportPeople } = require("../utils/sportPeople");
const { matches } = require("./helpers/memoryModel");

// Users (staff) as sport players sign in to the Sport app like students
// (owner, 2026-11-09). Synthetic ids, numbers and addresses only.
const S1 = "a".repeat(24); // a student
const U1 = "b".repeat(24); // a staff user with a real email
const U2 = "c".repeat(24); // a staff user with the model's placeholder email
const S_DUP = "d".repeat(24); // an old student record of U1 (same ID number)
const IT_ONLY = "e".repeat(24);

function store(seed) {
  const docs = seed.map((d) => ({ ...d }));
  return {
    docs,
    async get(f = {}) { return { success: true, result: docs.filter((d) => matches(d, f)).map((d) => ({ ...d })) }; },
    async update(f, patch) {
      const hit = docs.find((d) => matches(d, f));
      if (hit) Object.assign(hit, patch); else docs.push({ ...f, ...patch });
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
    async delete(f) { for (let i = docs.length - 1; i >= 0; i -= 1) if (matches(docs[i], f)) docs.splice(i, 1); return { success: true }; },
  };
}

const res = () => ({
  statusCode: 200, body: undefined, cookies: [],
  status(c) { this.statusCode = c; return this; },
  json(v) { this.body = v; return this; },
  cookie(name, value, options) { this.cookies.push({ name, value, options }); return this; },
  clearCookie() { return this; },
});

function setup({ players } = {}) {
  const students = store([
    { _id: S1, tz: "900000201", email: "s1@example.test" },
    { _id: S_DUP, tz: "900000202", email: "old@example.test" },
  ]);
  const users = store([
    { _id: U1, tz: "900000202", firstname: "موظف", role: "مرشد", email: "u1@example.test" },
    { _id: U2, tz: "900000203", firstname: "موظفة", role: "مساعد", email: "test@test.com" },
    { _id: IT_ONLY, tz: "900000204", firstname: "تقني", isIT: true, email: "it@example.test" },
  ]);
  const sent = [];
  const logs = [];
  const auth = createSportAuth({
    students: createSportPeople({ students, users }),
    players: store(players || [
      { studentId: S1, sportId: "x" }, { studentId: U1, sportId: "x", kind: "user" },
      { studentId: U2, sportId: "x", kind: "user" }, { studentId: IT_ONLY, sportId: "x", kind: "user" },
    ]),
    codes: store([]),
    ensureSport: async () => ({ _id: "x" }),
    sendCode: async (to, code) => { sent.push({ to, code }); },
    makeCode: () => "123456",
    makeCardToken: () => "t".repeat(43),
    log: (...args) => logs.push(args),
    now: () => Date.parse("2026-11-09T10:00:00Z"),
  });
  return { auth, students, users, sent, logs };
}

const ask = async (auth, tz) => { const r = res(); await auth.requestCode({ body: { tz } }, r); return r; };
const verify = async (auth, tz, code) => { const r = res(); await auth.verify({ body: { tz, code } }, r); return r; };
const subOf = (r) => jwt.decode(r.cookies[0].value).sub;

test("a user player gets the code by his ID number when his old student record is not a player", async () => {
  const { auth, sent } = setup();
  const asked = await ask(auth, "900000202");
  assert.equal(asked.body.ok, true);
  assert.deepEqual(sent, [{ to: "u1@example.test", code: "123456" }]);
  const done = await verify(auth, "900000202", "123456");
  assert.equal(done.body.ok, true);
  assert.equal(subOf(done), U1);
});

test("when both records of one ID number are players, nothing is sent", async () => {
  const { auth, sent, logs } = setup({ players: [{ studentId: U1, sportId: "x", kind: "user" }, { studentId: S_DUP, sportId: "x" }] });
  await ask(auth, "900000202");
  assert.deepEqual(sent, []);
  assert.equal(logs.length, 1);
  assert.equal((await verify(auth, "900000202", "123456")).statusCode, 400);
});

test("a user with only the placeholder email is told there is no email", async () => {
  const { auth, sent } = setup();
  const r = await ask(auth, "900000203");
  assert.equal(r.statusCode, 404);
  assert.equal(r.body.message, NO_EMAIL_MESSAGE);
  assert.deepEqual(sent, []);
});

test("a hidden IT account is never a sport player", async () => {
  const { auth, sent } = setup();
  assert.equal((await ask(auth, "900000204")).statusCode, 404);
  assert.deepEqual(sent, []);
});

test("the session of a user player loads him as req.sportStudent", async () => {
  const { auth } = setup();
  const token = jwt.sign({ sub: U1, typ: "sport-student" }, process.env.SPORT_SESSION_SECRET);
  const req = { headers: {}, cookies: { tamheed_sport: token } };
  let called = false;
  await auth.requireSportStudent(req, res(), () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.sportStudent.kind, "user");
  assert.equal(String(req.sportStudent._id), U1);
});

test("a printed card is issued on the user record and signs him in", async () => {
  const { auth, users } = setup();
  const issued = res();
  await auth.issueCard({ params: { studentId: U2 }, actor: { tz: "m1" } }, issued);
  assert.equal(issued.body.ok, true);
  assert.ok(users.docs.find((u) => u._id === U2).sportCardHash);
  const used = res();
  await auth.signInWithCard({ body: { token: "t".repeat(43) } }, used);
  assert.equal(used.body.ok, true);
  assert.equal(subOf(used), U2);
});

test("a manager's sign-out of a user player is written on his user record", async () => {
  const { auth, users } = setup();
  const r = res();
  await auth.signOutPlayer({ params: { studentId: U1 } }, r);
  assert.equal(r.body.ok, true);
  assert.ok(users.docs.find((u) => u._id === U1).sportSignedOutAt);
});

test("the user API never sends the sport card hash or passkeys", () => {
  const source = fs.readFileSync(path.join(__dirname, "../Entities/User/User.controller.js"), "utf8");
  const body = source.slice(source.indexOf("function sanitize(u)"), source.indexOf("function toDate("));
  assert.match(body, /delete o\.sportCardHash;/);
  assert.match(body, /delete o\.sportPasskeys;/);
});
