// The email code for signing in to System as an IT user with no role, or as
// the system account (owner, 2026-11-04). Its own store: IT's codes never count.
const assert = require("node:assert/strict");
const test = require("node:test");
const { createSystemCode } = require("../Entities/User/SystemCode.auth");

const SYSTEM_TZ = "000000026";
const IT_USER = { tz: "100000009", email: "it@example.com", isIT: true };

function codesStore() {
  const rows = [];
  const match = (row, filter) => Object.entries(filter).every(([k, v]) => row[k] === v);
  return {
    rows,
    async get(filter) { return { success: true, result: rows.filter((r) => match(r, filter)) }; },
    async update(filter, data) {
      const hit = rows.find((r) => match(r, filter));
      if (hit) Object.assign(hit, data); else rows.push({ ...data });
      return { success: true };
    },
    async updateExisting(filter, data) { const hit = rows.find((r) => match(r, filter)); if (hit) Object.assign(hit, data); return { success: true }; },
    async increment(filter, field) { const hit = rows.find((r) => match(r, filter)); hit[field] = (hit[field] || 0) + 1; return { result: hit }; },
    async delete(filter) {
      const before = rows.length;
      for (let i = rows.length - 1; i >= 0; i -= 1) if (match(rows[i], filter)) rows.splice(i, 1);
      return { result: { deletedCount: before - rows.length } };
    },
  };
}

function setup(extra = {}) {
  const sent = [];
  const clock = { t: Date.parse("2026-11-04T10:00:00Z") };
  const codes = codesStore();
  const auth = createSystemCode({
    codes,
    sendCode: async (to, code) => { sent.push({ to, code }); },
    makeCode: () => "123456",
    mailReady: () => true,
    systemTz: () => SYSTEM_TZ,
    systemEmail: () => "emergency@example.com",
    now: () => clock.t,
    log() {},
    ...extra,
  });
  return { auth, codes, sent, clock };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("the code goes to the user's own email", async () => {
  const { auth, sent } = setup();
  assert.equal(await auth.send(IT_USER), "sent");
  await settle();
  assert.deepEqual(sent, [{ to: "it@example.com", code: "123456" }]);
});

test("the system account's code goes only to the emergency mailbox", async () => {
  const { auth, sent } = setup();
  assert.equal(await auth.send({ tz: SYSTEM_TZ, email: "stored@example.com" }), "sent");
  await settle();
  assert.equal(sent[0].to, "emergency@example.com");
});

test("no real email means no code", async () => {
  const { auth, codes } = setup();
  assert.equal(await auth.send({ tz: "100000017", email: "test@test.com" }), "NO_EMAIL");
  assert.equal(await auth.send({ tz: "100000017" }), "NO_EMAIL");
  assert.equal(codes.rows.length, 0);
});

test("email not configured for the system account means no code", async () => {
  const { auth } = setup({ systemEmail: () => "" });
  assert.equal(await auth.send({ tz: SYSTEM_TZ }), "NO_EMAIL");
});

test("the right code works once", async () => {
  const { auth } = setup();
  await auth.send(IT_USER);
  assert.equal(await auth.check(IT_USER.tz, "123456"), "ok");
  assert.equal(await auth.check(IT_USER.tz, "123456"), "bad");
});

test("a wrong code is counted, and the fifth ends it", async () => {
  const { auth } = setup();
  await auth.send(IT_USER);
  for (let i = 0; i < 4; i += 1) assert.equal(await auth.check(IT_USER.tz, "000000"), "wrong");
  assert.equal(await auth.check(IT_USER.tz, "000000"), "wrong");
  assert.equal(await auth.check(IT_USER.tz, "123456"), "bad");
  assert.equal(await auth.send(IT_USER), "TOO_MANY_CODES");
});

test("an expired code fails", async () => {
  const { auth, clock } = setup();
  await auth.send(IT_USER);
  clock.t += 10 * 60 * 1000 + 1;
  assert.equal(await auth.check(IT_USER.tz, "123456"), "bad");
});

test("a malformed code never reaches the store", async () => {
  const { auth } = setup();
  await auth.send(IT_USER);
  assert.equal(await auth.check(IT_USER.tz, "12"), "bad");
  assert.equal(await auth.check("", "123456"), "bad");
});

test("the store is its own collection, not IT's", () => {
  const { SystemLoginCodeModelDef } = require("../Entities/User/SystemLoginCode.model");
  const { ItLoginCodeModelDef } = require("../Entities/It/ItLoginCode.model");
  assert.equal(SystemLoginCodeModelDef.collections.active, "SystemLoginCodes");
  assert.notEqual(SystemLoginCodeModelDef.collections.active, ItLoginCodeModelDef.collections.active);
});
