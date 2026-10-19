const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { auditStub } = require("./helpers/auditStub");
const bcrypt = require("bcryptjs");

const {
  LOCK_THRESHOLD,
  SYSTEM_ALERT_EVERY,
  LOCKED_MESSAGE,
  isLocked,
  afterFailure,
  afterSuccess,
} = require("../utils/loginLockout");

const EXPECTED_MESSAGE =
  "تم حظر الحساب بسبب محاولات دخول فاشلة متكررة. يرجى التوجه إلى قسم تكنولوجيا المعلومات في الجمعية.";
const FAKE_HASH = bcrypt.hashSync("real-pass", 4);
const NOW = new Date("2026-01-01T00:00:00Z");

/* ---------- unit ---------- */

test("constants carry the agreed values", () => {
  assert.equal(LOCK_THRESHOLD, 5);
  assert.equal(SYSTEM_ALERT_EVERY, 5);
  assert.equal(LOCKED_MESSAGE, EXPECTED_MESSAGE);
});

test("four failures do not lock, the fifth does", () => {
  let user = { failedLoginCount: 0, lockedAt: null };
  for (let i = 1; i <= 4; i++) {
    const next = afterFailure(user, { isSystem: false, now: NOW });
    assert.equal(next.failedLoginCount, i);
    assert.equal(next.lockedAt, null);
    user = { ...user, ...next };
    assert.equal(isLocked(user, { isSystem: false }), false);
  }
  const fifth = afterFailure(user, { isSystem: false, now: NOW });
  assert.equal(fifth.failedLoginCount, 5);
  assert.equal(fifth.lockedAt, NOW);
  assert.equal(fifth.alertSystem, false);
  assert.equal(isLocked({ ...user, ...fifth }, { isSystem: false }), true);
});

test("the system account is never locked and alerts every fifth failure", () => {
  assert.equal(isLocked({ lockedAt: NOW }, { isSystem: true }), false);
  for (const [count, alert] of [[5, true], [10, true], [6, false], [4, false]]) {
    const next = afterFailure({ failedLoginCount: count - 1 }, { isSystem: true, now: NOW });
    assert.equal(next.failedLoginCount, count);
    assert.equal(next.lockedAt, null);
    assert.equal(next.alertSystem, alert);
  }
});

test("afterSuccess clears the counter and the lock", () => {
  assert.deepEqual(afterSuccess(), { failedLoginCount: 0, lockedAt: null });
});

/* ---------- controller ---------- */

function loadController({ user, room = "active", env = {}, ...opts } = {}) {
  const calls = { updates: [], emails: [], increments: [], locks: [] };
  const stored = user === undefined
    ? { _id: "id-1", tz: "1", roles: [], password: FAKE_HASH }
    : user;
  const dependencies = {
    bcryptjs: bcrypt,
    jsonwebtoken: {},
    path,
    "./User.model": {
      UserModelDef: {
        async get(filter, r) {
          if (stored && (filter.tz === stored.tz) && r === room) return { success: true, result: [stored] };
          return { success: true, result: [] };
        },
        async update(...args) { if (opts.upgradeThrows && args[1] && args[1].password) throw new Error("write failed"); calls.updates.push(args); return { success: true }; },
        async incrementFailedLogin(tz, r) {
          calls.increments.push([tz, r]);
          if (opts.incrementThrows) throw new Error("db down");
          stored.failedLoginCount = (Number(stored.failedLoginCount) || 0) + 1;
          return { success: true, result: { ...stored } };
        },
        async lockIfThresholdReached(tz, lockedAt, threshold, r) {
          calls.locks.push([tz, lockedAt, threshold, r]);
          return { success: true, result: null };
        },
      },
    },
    "../../utils/sendEmail": {
      sendResetPasswordEmail: async (...args) => { calls.emails.push(args); },
    },
    "../../utils/jwt": {
      signAccessToken: () => "access",
      signRefreshToken: () => "refresh",
      setRefreshCookie() {},
      clearRefreshCookie() {},
      sha256: (v) => `sha:${v}`,
      computeAccessExpMsFromNow: () => 1000,
    },
    "../../utils/textEncoding": require("../utils/textEncoding"),
    "../../utils/permissions": require("../utils/permissions"),
    "../../utils/loginLockout": require("../utils/loginLockout"),
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
    ...auditStub().deps,
  };
  const filename = path.join(__dirname, "../Entities/User/User.controller.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    process: { env: { ...process.env, ...env } },
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return { controller: module.exports, calls };
}

function makeRes() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    cookie() { return this; },
  };
}

const lockedUser = () => ({
  _id: "id-1", tz: "1", roles: [], password: FAKE_HASH, failedLoginCount: 5, lockedAt: NOW,
});

test("a locked account is refused even with the right password", async () => {
  const { controller, calls } = loadController({ user: lockedUser() });
  const res = makeRes();
  await controller.login({ body: { tz: "1", password: "real-pass" }, headers: {}, cookies: {} }, res);
  assert.equal(res.statusCode, 423);
  assert.equal(res.body.code, "ACCOUNT_LOCKED");
  assert.equal(res.body.message, EXPECTED_MESSAGE);
  assert.equal(calls.updates.length, 0);
});

test("a wrong password is counted atomically and the fifth failure locks the account", async () => {
  const user = { _id: "id-1", tz: "1", roles: [], password: FAKE_HASH, failedLoginCount: 4, lockedAt: null };
  const { controller, calls } = loadController({ user });
  const res = makeRes();
  await controller.login({ body: { tz: "1", password: "wrong" }, headers: {}, cookies: {} }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "INVALID_CREDENTIALS");
  assert.deepEqual(calls.increments, [["1", "active"]]);
  assert.equal(calls.updates.length, 0, "no read-modify-write of the counter");
  assert.equal(calls.locks.length, 1);
  const [tz, lockedAt, threshold, room] = calls.locks[0];
  assert.equal(tz, "1");
  assert.equal(room, "active");
  assert.equal(threshold, 5);
  assert.equal(Object.prototype.toString.call(lockedAt), "[object Date]");
});

test("a failure below the threshold increments but does not lock", async () => {
  const user = { _id: "id-1", tz: "1", roles: [], password: FAKE_HASH, failedLoginCount: 1, lockedAt: null };
  const { controller, calls } = loadController({ user });
  const res = makeRes();
  await controller.login({ body: { tz: "1", password: "wrong" }, headers: {}, cookies: {} }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(calls.increments.length, 1);
  assert.equal(calls.locks.length, 0);
});

test("a database error while counting still answers 401 without leaking the error", async () => {
  const { controller } = loadController({ incrementThrows: true });
  const res = makeRes();
  await controller.login({ body: { tz: "1", password: "wrong" }, headers: {}, cookies: {} }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "INVALID_CREDENTIALS");
  assert.ok(!JSON.stringify(res.body).includes("db down"));
});

test("a successful login resets the counter", async () => {
  const user = { _id: "id-1", tz: "1", roles: [], password: FAKE_HASH, failedLoginCount: 3, lockedAt: null };
  const { controller, calls } = loadController({ user });
  const res = makeRes();
  await controller.login({ body: { tz: "1", password: "real-pass" }, headers: {}, cookies: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(
    calls.updates.some(([, data]) => data.failedLoginCount === 0 && data.lockedAt === null),
    "expected an update resetting the counter"
  );
});

test("unknown tz does not write anything", async () => {
  const { controller, calls } = loadController();
  const res = makeRes();
  await controller.login({ body: { tz: "999", password: "x" }, headers: {}, cookies: {} }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(calls.updates.length, 0);
});

test("the system account is never locked by failures", async () => {
  const user = { _id: "id-1", tz: "1", roles: [], password: FAKE_HASH, failedLoginCount: 9, lockedAt: NOW };
  const { controller, calls } = loadController({ user, env: { SYSTEM_ADMIN_TZ: "1" } });
  const res = makeRes();
  await controller.login({ body: { tz: "1", password: "real-pass" }, headers: {}, cookies: {} }, res);
  assert.equal(res.statusCode, 200);

  const wrong = makeRes();
  await controller.login({ body: { tz: "1", password: "wrong" }, headers: {}, cookies: {} }, wrong);
  assert.equal(wrong.statusCode, 401);
  assert.equal(calls.increments.length, 1, "failure counted for system account");
  assert.equal(calls.locks.length, 0, "system account never gets lockedAt");
});

test("forgot-password on a locked account sends no email", async () => {
  const { controller, calls } = loadController({ user: lockedUser() });
  const res = makeRes();
  await controller.forgotPassword({ body: { tz: "1" } }, res);
  assert.equal(res.statusCode, 423);
  assert.equal(res.body.code, "ACCOUNT_LOCKED");
  assert.equal(res.body.message, EXPECTED_MESSAGE);
  assert.equal(calls.emails.length, 0);
  assert.equal(calls.updates.length, 0);
});

test("reset-password on a locked account is refused", async () => {
  const { controller, calls } = loadController({ user: lockedUser() });
  const res = makeRes();
  await controller.resetPassword(
    { body: { tz: "1", otp: "123456", newPassword: "n", confirmPassword: "n" } },
    res
  );
  assert.equal(res.statusCode, 423);
  assert.equal(res.body.code, "ACCOUNT_LOCKED");
  assert.equal(res.body.message, EXPECTED_MESSAGE);
  assert.equal(calls.updates.length, 0);
});

test("afterFailureCount decides the lock from an atomically returned count", () => {
  const { afterFailureCount } = require("../utils/loginLockout");
  assert.equal(afterFailureCount(4, { isSystem: false, now: NOW }).lockedAt, null);
  assert.equal(afterFailureCount(5, { isSystem: false, now: NOW }).lockedAt, NOW);
  assert.equal(afterFailureCount(5, { isSystem: true, now: NOW }).lockedAt, null);
  assert.equal(afterFailureCount(5, { isSystem: true, now: NOW }).alertSystem, true);
});

test("a correct password still logs in when the bcrypt upgrade write fails", async () => {
  const user = { _id: "id-1", tz: "1", roles: [], password: FAKE_HASH };
  const { controller, calls } = loadController({ user, upgradeThrows: true });
  const res = makeRes();
  await controller.login({ body: { tz: "1", password: "real-pass" }, headers: {}, cookies: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls.increments.length, 0, "not counted as a failure");
});

test("a successful password reset clears the failure counter", async () => {
  const user = {
    _id: "id-1", tz: "1", roles: [], password: FAKE_HASH, failedLoginCount: 3, lockedAt: null,
    resetOtpHash: "sha:123456", resetOtpExpires: new Date(Date.now() + 60000),
  };
  const { controller, calls } = loadController({ user });
  const res = makeRes();
  await controller.resetPassword(
    { body: { tz: "1", otp: "123456", newPassword: "newpass1", confirmPassword: "newpass1" } },
    res
  );
  assert.equal(res.body.ok, true);
  assert.ok(
    calls.updates.some(([, d]) => d.password && d.failedLoginCount === 0 && d.lockedAt === null),
    "reset update must also clear the counter"
  );
});
