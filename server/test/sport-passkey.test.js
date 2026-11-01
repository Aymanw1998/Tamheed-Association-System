const assert = require("node:assert/strict");
const test = require("node:test");
const jwt = require("jsonwebtoken");

process.env.SPORT_SESSION_SECRET = "test-sport-session-secret";

const { createSportPasskeys, CHALLENGE_COOKIE } = require("../Entities/SportPortal/SportPortal.passkey");

// Passkeys (owner, 2026-11-01): a player signs in once (code or card), saves a
// passkey on the phone, and from then on signs in with a fingerprint or face.

const res = () => ({
  statusCode: 200, body: undefined, cookies: [], cleared: [],
  status(c) { this.statusCode = c; return this; },
  json(v) { this.body = v; return this; },
  cookie(name, value, options) { this.cookies.push({ name, value, options }); return this; },
  clearCookie(name, options) { this.cleared.push({ name, options }); return this; },
});
const cookieOf = (r) => r.cookies.find((c) => c.name === CHALLENGE_COOKIE)?.value;

function setup({ verified = true, players = ["s1"] } = {}) {
  const students = [
    { _id: "s1", tz: "100000009", firstname: "لاعب", lastname: "أول", sportPasskeys: [] },
    { _id: "s2", tz: "100000017", firstname: "ثان", lastname: "", sportPasskeys: [] },
  ];
  const calls = { regOptions: [], regVerify: [], authOptions: [], authVerify: [], sessions: [] };
  const webauthn = {
    async generateRegistrationOptions(o) { calls.regOptions.push(o); return { challenge: "reg-challenge", rp: { id: o.rpID } }; },
    async verifyRegistrationResponse(o) {
      calls.regVerify.push(o);
      return verified
        ? { verified: true, registrationInfo: { credential: { id: "cred-1", publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ["internal"] } } }
        : { verified: false };
    },
    async generateAuthenticationOptions(o) { calls.authOptions.push(o); return { challenge: "auth-challenge" }; },
    async verifyAuthenticationResponse(o) {
      calls.authVerify.push(o);
      return verified ? { verified: true, authenticationInfo: { newCounter: 7 } } : { verified: false };
    },
  };
  const passkeys = createSportPasskeys({
    webauthn,
    students: {
      async get(f) {
        const hit = students.filter((s) => (f._id ? s._id === f._id : (s.sportPasskeys || []).some((p) => p.id === f["sportPasskeys.id"])));
        return { success: true, result: hit.map((s) => JSON.parse(JSON.stringify(s))) };
      },
      async updateExisting(f, patch) { Object.assign(students.find((s) => s._id === f._id), patch); return { success: true }; },
    },
    isPlayer: async (id) => players.includes(String(id)),
    signIn: (r, id) => { calls.sessions.push(String(id)); r.cookie("tamheed_sport", `session-${id}`, {}); },
    site: () => ({ rpID: "sport.test", origin: "https://sport.test" }),
    now: () => Date.parse("2026-11-01T10:00:00Z"),
    log() {},
  });
  return { passkeys, students, calls };
}

const me = (students, id = "s1") => ({ sportStudent: students.find((s) => s._id === id) });

async function register(ctx) {
  const o = res();
  await ctx.passkeys.registerOptions({ ...me(ctx.students), cookies: {} }, o);
  const r = res();
  await ctx.passkeys.register({ ...me(ctx.students), cookies: { [CHALLENGE_COOKIE]: cookieOf(o) }, body: { response: { id: "cred-1" } } }, r);
  return r;
}

test("saving a passkey: options name the player (never the ID number) and the site", async () => {
  const ctx = setup();
  const o = res();
  await ctx.passkeys.registerOptions({ ...me(ctx.students), cookies: {} }, o);
  assert.equal(o.statusCode, 200);
  const opts = ctx.calls.regOptions[0];
  assert.equal(opts.rpID, "sport.test");
  assert.equal(opts.userName, "لاعب أول");
  assert.equal(JSON.stringify(opts).includes("100000009"), false);
  assert.equal(opts.authenticatorSelection.residentKey, "required");
  assert.ok(cookieOf(o), "the challenge travels in a signed cookie");
});

test("a verified passkey is stored on the student with its public key and counter", async () => {
  const ctx = setup();
  const r = await register(ctx);
  assert.equal(r.statusCode, 200);
  assert.equal(ctx.calls.regVerify[0].expectedChallenge, "reg-challenge");
  assert.equal(ctx.calls.regVerify[0].expectedOrigin, "https://sport.test");
  assert.equal(ctx.calls.regVerify[0].expectedRPID, "sport.test");
  const [pk] = ctx.students[0].sportPasskeys;
  assert.equal(pk.id, "cred-1");
  assert.equal(pk.publicKey, "AQID");
  assert.equal(pk.counter, 0);
  assert.equal(r.cleared[0].name, CHALLENGE_COOKIE, "a challenge is used once");
});

test("saving again excludes the passkeys already saved", async () => {
  const ctx = setup();
  await register(ctx);
  await ctx.passkeys.registerOptions({ ...me(ctx.students), cookies: {} }, res());
  assert.deepEqual(ctx.calls.regOptions[1].excludeCredentials.map((c) => c.id), ["cred-1"]);
});

test("a refused or challenge-less registration stores nothing", async () => {
  const refused = setup({ verified: false });
  assert.equal((await register(refused)).statusCode, 400);
  assert.equal(refused.students[0].sportPasskeys.length, 0);
  const ctx = setup();
  const r = res();
  await ctx.passkeys.register({ ...me(ctx.students), cookies: {}, body: { response: { id: "x" } } }, r);
  assert.equal(r.statusCode, 400);
  assert.equal(ctx.calls.regVerify.length, 0);
});

async function signIn(ctx, credId = "cred-1", cookieFrom) {
  const o = res();
  await ctx.passkeys.loginOptions({ cookies: {} }, o);
  const r = res();
  await ctx.passkeys.login({ cookies: { [CHALLENGE_COOKIE]: cookieFrom || cookieOf(o) }, body: { response: { id: credId } } }, r);
  return r;
}

test("signing in with a saved passkey starts the player's session and updates its counter", async () => {
  const ctx = setup();
  await register(ctx);
  const r = await signIn(ctx);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(ctx.calls.sessions, ["s1"]);
  const v = ctx.calls.authVerify[0];
  assert.equal(v.expectedChallenge, "auth-challenge");
  assert.equal(v.credential.id, "cred-1");
  assert.deepEqual([...v.credential.publicKey], [1, 2, 3]);
  assert.equal(ctx.students[0].sportPasskeys[0].counter, 7);
  assert.ok(ctx.students[0].sportPasskeys[0].lastUsedAt);
});

test("an unknown passkey, a refused one, or one of a former player signs nobody in", async () => {
  const ctx = setup();
  await register(ctx);
  assert.equal((await signIn(ctx, "cred-unknown")).statusCode, 400);
  const refused = setup({ verified: false });
  refused.students[0].sportPasskeys = [{ id: "cred-1", publicKey: "AQID", counter: 0 }];
  assert.equal((await signIn(refused)).statusCode, 400);
  const gone = setup({ players: [] });
  gone.students[0].sportPasskeys = [{ id: "cred-1", publicKey: "AQID", counter: 0 }];
  assert.equal((await signIn(gone)).statusCode, 400);
  assert.deepEqual([...ctx.calls.sessions, ...refused.calls.sessions, ...gone.calls.sessions], []);
});

test("a registration challenge is not accepted for signing in", async () => {
  const ctx = setup();
  await register(ctx);
  const o = res();
  await ctx.passkeys.registerOptions({ ...me(ctx.students), cookies: {} }, o);
  const r = await signIn(ctx, "cred-1", cookieOf(o));
  assert.equal(r.statusCode, 400);
});

test("an expired or forged challenge cookie is refused", async () => {
  const ctx = setup();
  await register(ctx);
  const forged = jwt.sign({ c: "auth-challenge", p: "login" }, "another-secret");
  assert.equal((await signIn(ctx, "cred-1", forged)).statusCode, 400);
});

// The real library (not a stand-in): the options it makes from ours carry
// the site, the player's name, a challenge, and ask for a discoverable key.
test("with the real webauthn library, the options are well formed", async () => {
  const real = createSportPasskeys({
    students: { async get() { return { success: true, result: [] }; }, async updateExisting() {} },
    isPlayer: async () => true, signIn() {}, log() {},
    site: () => ({ rpID: "sport.test", origin: "https://sport.test" }),
  });
  const reg = res();
  await real.registerOptions({ sportStudent: { _id: "s1", firstname: "لاعب", lastname: "أول", sportPasskeys: [{ id: "AQID", transports: ["internal"] }] }, cookies: {} }, reg);
  assert.equal(reg.statusCode, 200);
  const o = reg.body.options;
  assert.equal(o.rp.id, "sport.test");
  assert.equal(o.user.name, "لاعب أول");
  assert.equal(o.authenticatorSelection.residentKey, "required");
  assert.deepEqual(o.excludeCredentials.map((c) => c.id), ["AQID"]);
  assert.ok(o.challenge.length >= 16);
  const login = res();
  await real.loginOptions({ cookies: {} }, login);
  assert.equal(login.statusCode, 200);
  assert.equal(login.body.options.rpId, "sport.test");
  // A made-up answer is refused, never a crash.
  const bad = res();
  await real.login({ cookies: { [CHALLENGE_COOKIE]: cookieOf(login) }, body: { response: { id: "AQID", response: {} } } }, bad);
  assert.equal(bad.statusCode, 400);
});
