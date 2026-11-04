const assert = require("node:assert/strict");
const test = require("node:test");

process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.SYSTEM_ADMIN_TZ = "000000026";

const { createUserPasskeys, CHALLENGE_COOKIE } = require("../Entities/User/User.passkey");

// Passkeys in System (owner, 2026-11-04): for every user, saved while signed
// in; a passkey is a full sign-in. Synthetic values only.

const res = () => ({
  statusCode: 200, body: undefined, cookies: [], cleared: [],
  status(c) { this.statusCode = c; return this; },
  json(v) { this.body = v; return this; },
  cookie(name, value, options) { this.cookies.push({ name, value, options }); return this; },
  clearCookie(name, options) { this.cleared.push({ name, options }); return this; },
});
const cookieOf = (r) => r.cookies.find((c) => c.name === CHALLENGE_COOKIE)?.value;

function setup({ verified = true, seed = [] } = {}) {
  const users = seed.length ? seed : [
    { _id: "u1", tz: "100000009", firstname: "A", lastname: "Guide", role: "مرشد", roles: ["مرشد"], systemPasskeys: [] },
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
  const passkeys = createUserPasskeys({
    webauthn,
    site: () => ({ rpID: "system.example.test", origin: "https://system.example.test" }),
    audit: { record: async () => {} },
    users: {
      async get(f) {
        const hit = users.filter((u) => (f.tz ? u.tz === f.tz : (u.systemPasskeys || []).some((p) => p.id === f["systemPasskeys.id"])));
        return { success: true, result: hit.map((u) => JSON.parse(JSON.stringify(u))) };
      },
      async updateExisting(f, data) {
        const hit = users.find((u) => u.tz === f.tz);
        if (hit) Object.assign(hit, data);
        return { success: true, result: hit };
      },
    },
    finishSignIn: async (req, out, user, room, isSystem) => {
      calls.finished.push({ tz: user.tz, room, isSystem });
      return out.status(200).json({ ok: true, accessToken: "access" });
    },
    log() {},
  });
  return { passkeys, users, calls };
}

const saved = (id = "cred-1") => ({ id, publicKey: "AQID", counter: 0, transports: ["internal"], createdAt: new Date(), lastUsedAt: null });

async function loginWith(ctx) {
  const opts = res();
  await ctx.passkeys.loginOptions({}, opts);
  const out = res();
  await ctx.passkeys.login({ cookies: { [CHALLENGE_COOKIE]: cookieOf(opts) }, body: { response: { id: "cred-1" } } }, out);
  return out;
}

test("saved while signed in, under systemPasskeys and never itPasskeys", async () => {
  const ctx = setup();
  const actor = { tz: "100000009", name: "A Guide", user: ctx.users[0] };
  const opts = res();
  await ctx.passkeys.registerOptions({ actor }, opts);
  assert.equal(ctx.calls.regOptions[0].rpID, "system.example.test");
  const out = res();
  await ctx.passkeys.register({ actor, cookies: { [CHALLENGE_COOKIE]: cookieOf(opts) }, body: { response: { id: "x" } } }, out);
  assert.equal(out.body.ok, true);
  assert.equal(ctx.users[0].systemPasskeys[0].id, "cred-1");
  assert.equal(ctx.users[0].itPasskeys, undefined);
});

test("a failed verification saves nothing", async () => {
  const ctx = setup({ verified: false });
  const actor = { tz: "100000009", name: "A", user: ctx.users[0] };
  const opts = res();
  await ctx.passkeys.registerOptions({ actor }, opts);
  const out = res();
  await ctx.passkeys.register({ actor, cookies: { [CHALLENGE_COOKIE]: cookieOf(opts) }, body: { response: {} } }, out);
  assert.equal(out.statusCode, 400);
  assert.equal(ctx.users[0].systemPasskeys.length, 0);
});

test("a passkey signs in through the normal last step, with no code for a hidden IT user", async () => {
  const ctx = setup({ seed: [{ _id: "h", tz: "100000017", isIT: true, systemPasskeys: [saved()] }] });
  const out = await loginWith(ctx);
  assert.equal(out.statusCode, 200);
  assert.deepEqual(ctx.calls.finished, [{ tz: "100000017", room: "active", isSystem: false }]);
  assert.equal(ctx.calls.authVerify[0].expectedRPID, "system.example.test");
  assert.equal(ctx.users[0].systemPasskeys[0].counter, 7);
});

test("a credential saved only for the IT site cannot sign in here", async () => {
  const ctx = setup({ seed: [{ _id: "h", tz: "100000017", isIT: true, itPasskeys: [saved()], systemPasskeys: [] }] });
  const out = await loginWith(ctx);
  assert.equal(out.statusCode, 400);
  assert.equal(ctx.calls.finished.length, 0);
});

test("a locked account and a blocked IT user with no role are refused", async () => {
  const locked = setup({ seed: [{ _id: "l", tz: "100000017", role: "مرشد", lockedAt: new Date(), systemPasskeys: [saved()] }] });
  assert.equal((await loginWith(locked)).statusCode, 423);
  const blocked = setup({ seed: [{ _id: "b", tz: "100000017", isIT: true, itBlockedAt: new Date(), systemPasskeys: [saved()] }] });
  assert.equal((await loginWith(blocked)).statusCode, 400);
  assert.equal(blocked.calls.finished.length, 0);
});

test("a bad signature or a missing, spent or mismatched challenge fails", async () => {
  const bad = setup({ verified: false, seed: [{ _id: "g", tz: "1", role: "مرشد", systemPasskeys: [saved()] }] });
  assert.equal((await loginWith(bad)).statusCode, 400);
  const ctx = setup({ seed: [{ _id: "g", tz: "1", role: "مرشد", systemPasskeys: [saved()] }] });
  const none = res();
  await ctx.passkeys.login({ cookies: {}, body: { response: { id: "cred-1" } } }, none);
  assert.equal(none.statusCode, 400);
  const actor = { tz: "1", name: "A", user: ctx.users[0] };
  const reg = res();
  await ctx.passkeys.registerOptions({ actor }, reg);
  const crossed = res();
  await ctx.passkeys.login({ cookies: { [CHALLENGE_COOKIE]: cookieOf(reg) }, body: { response: { id: "cred-1" } } }, crossed);
  assert.equal(crossed.statusCode, 400);
});
