const assert = require("node:assert/strict");
const test = require("node:test");

process.env.IT_SESSION_SECRET = "test-it-session-secret";

const { createItPasskeys, CHALLENGE_COOKIE } = require("../Entities/It/It.passkey");

// Passkeys on the IT site (owner, 2026-11-03): an IT user signed in with the
// password and the email code saves a passkey; from then on a fingerprint or
// face replaces both. Synthetic values only.

const res = () => ({
  statusCode: 200, body: undefined, cookies: [], cleared: [],
  status(c) { this.statusCode = c; return this; },
  json(v) { this.body = v; return this; },
  cookie(name, value, options) { this.cookies.push({ name, value, options }); return this; },
  clearCookie(name, options) { this.cleared.push({ name, options }); return this; },
});
const cookieOf = (r) => r.cookies.find((c) => c.name === CHALLENGE_COOKIE)?.value;

function setup({ verified = true, finish = true } = {}) {
  const users = [
    { _id: "u1", tz: "100000009", firstname: "It", lastname: "Alpha", isIT: true, itPasskeys: [] },
    { _id: "u2", tz: "100000017", firstname: "It", lastname: "Beta", isIT: true, itPasskeys: [] },
  ];
  const calls = { regOptions: [], authVerify: [], finished: [] };
  const webauthn = {
    async generateRegistrationOptions(o) { calls.regOptions.push(o); return { challenge: "reg-challenge" }; },
    async verifyRegistrationResponse() {
      return verified
        ? { verified: true, registrationInfo: { credential: { id: "cred-1", publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ["internal"] } } }
        : { verified: false };
    },
    async generateAuthenticationOptions() { return { challenge: "auth-challenge" }; },
    async verifyAuthenticationResponse(o) {
      calls.authVerify.push(o);
      return verified ? { verified: true, authenticationInfo: { newCounter: 7 } } : { verified: false };
    },
  };
  const passkeys = createItPasskeys({
    webauthn,
    users: {
      async get(f) {
        const hit = users.filter((u) => (f.tz ? u.tz === f.tz : (u.itPasskeys || []).some((p) => p.id === f["itPasskeys.id"])));
        return { success: true, result: hit.map((u) => JSON.parse(JSON.stringify(u))) };
      },
      async updateExisting(f, patch) { Object.assign(users.find((u) => u.tz === f.tz), patch); return { success: true }; },
    },
    completeSignIn: async (req, r, tz, opts) => {
      calls.finished.push({ tz, opts });
      if (finish) r.cookie("tamheed_it", `session-${tz}`, {});
      return finish;
    },
    site: () => ({ rpID: "it.test", origin: "https://it.test" }),
    now: () => Date.parse("2026-11-03T10:00:00Z"),
    log() {},
  });
  return { passkeys, users, calls };
}

const actorOf = (users, tz = "100000009") => ({ actor: { it: true, tz, name: "It Alpha", user: users.find((u) => u.tz === tz) } });

async function register(ctx) {
  const o = res();
  await ctx.passkeys.registerOptions({ ...actorOf(ctx.users), cookies: {} }, o);
  const r = res();
  await ctx.passkeys.register({ ...actorOf(ctx.users), cookies: { [CHALLENGE_COOKIE]: cookieOf(o) }, body: { response: { id: "cred-1" } } }, r);
  return r;
}

async function login(ctx, credId = "cred-1") {
  const o = res();
  await ctx.passkeys.loginOptions({ cookies: {} }, o);
  const r = res();
  await ctx.passkeys.login({ cookies: { [CHALLENGE_COOKIE]: cookieOf(o) }, body: { response: { id: credId } } }, r);
  return r;
}

test("saving: the options name the IT site and the user's name, never the ID number", async () => {
  const ctx = setup();
  const o = res();
  await ctx.passkeys.registerOptions({ ...actorOf(ctx.users), cookies: {} }, o);
  assert.equal(o.statusCode, 200);
  const opts = ctx.calls.regOptions[0];
  assert.equal(opts.rpID, "it.test");
  assert.equal(opts.userName, "It Alpha");
  assert.equal(JSON.stringify(opts).includes("100000009"), false);
  assert.equal(opts.authenticatorSelection.residentKey, "required");
  assert.equal(opts.authenticatorSelection.userVerification, "required");
  const cookie = o.cookies.find((c) => c.name === CHALLENGE_COOKIE);
  assert.equal(cookie.options.path, "/api/it");
  assert.equal(cookie.options.httpOnly, true);
});

test("saving stores the passkey on the user; a challenge from another user does not count", async () => {
  const ctx = setup();
  assert.equal((await register(ctx)).statusCode, 200);
  assert.equal(ctx.users[0].itPasskeys.length, 1);
  assert.equal(ctx.users[0].itPasskeys[0].id, "cred-1");

  const o = res();
  await ctx.passkeys.registerOptions({ ...actorOf(ctx.users), cookies: {} }, o);
  const r = res();
  await ctx.passkeys.register({ ...actorOf(ctx.users, "100000017"), cookies: { [CHALLENGE_COOKIE]: cookieOf(o) }, body: { response: { id: "cred-2" } } }, r);
  assert.equal(r.statusCode, 400);
  assert.equal(ctx.users[1].itPasskeys.length, 0);
});

test("signing in: a saved passkey replaces the password and the code; the counter moves", async () => {
  const ctx = setup();
  await register(ctx);
  const r = await login(ctx);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(ctx.calls.finished.map((f) => f.tz), ["100000009"]);
  assert.equal(ctx.calls.finished[0].opts.needsFreshPassword, true);
  assert.equal(ctx.calls.authVerify[0].expectedRPID, "it.test");
  assert.equal(ctx.users[0].itPasskeys[0].counter, 7);
});

test("signing in fails with an unknown passkey, a failed check, no challenge, or a user who may not use IT", async () => {
  const ctx = setup();
  await register(ctx);
  assert.equal((await login(ctx, "cred-unknown")).statusCode, 400);

  const noChallenge = res();
  await ctx.passkeys.login({ cookies: {}, body: { response: { id: "cred-1" } } }, noChallenge);
  assert.equal(noChallenge.statusCode, 400);

  const failed = setup({ verified: false });
  failed.users[0].itPasskeys = [{ id: "cred-1", publicKey: "AQID", counter: 0, transports: [] }];
  assert.equal((await login(failed)).statusCode, 400);
  assert.equal(failed.calls.finished.length, 0);

  const blocked = setup({ finish: false });
  blocked.users[0].itPasskeys = [{ id: "cred-1", publicKey: "AQID", counter: 0, transports: [] }];
  const r = await login(blocked);
  assert.equal(r.statusCode, 400);
  assert.equal(r.cookies.some((c) => c.name === "tamheed_it"), false);
});
