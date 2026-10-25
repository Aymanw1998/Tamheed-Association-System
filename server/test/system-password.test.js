// Task 14: the system account's monthly password change, recovery by an
// administrator (systemRecovery.reset), the IT server script, and the alert
// email every fifth failed sign-in. No database, no real email: every mail
// goes to an in-memory stub. All IDs, addresses and passwords are synthetic.
const assert = require("node:assert/strict");
const live = require("./helpers/liveStubs");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const express = require("express");
const jwt = require("jsonwebtoken");
const { auditStub } = require("./helpers/auditStub");
const { actorFor } = require("./helpers/actors");

const SYSTEM_TZ = "SYS-PW-TEST";
const SYSTEM_EMAIL = "owner-mailbox@example.test";
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-19T10:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY);

process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-access-secret";

const sp = require("../utils/systemPassword");

/* ================= pure rules ================= */

test("PASSWORD_MAX_AGE_DAYS is 30 and applies to the system account only", () => {
  assert.equal(sp.PASSWORD_MAX_AGE_DAYS, 30);
  assert.equal(sp.mustChangePassword({ passwordChangedAt: daysAgo(29) }, { isSystem: true, now: NOW }), false);
  assert.equal(sp.mustChangePassword({ passwordChangedAt: daysAgo(31) }, { isSystem: true, now: NOW }), true);
  assert.equal(sp.mustChangePassword({}, { isSystem: true, now: NOW }), true, "missing date forces a change");
  assert.equal(sp.mustChangePassword({ passwordChangedAt: null }, { isSystem: true, now: NOW }), true);
  assert.equal(sp.mustChangePassword({ passwordChangedAt: "garbage" }, { isSystem: true, now: NOW }), true);
  assert.equal(sp.mustChangePassword({ passwordChangedAt: new Date(0) }, { isSystem: true, now: NOW }), true);
  assert.equal(sp.mustChangePassword({}, { isSystem: false, now: NOW }), false, "never for other accounts");
  assert.equal(sp.mustChangePassword({ passwordChangedAt: daysAgo(400) }, { isSystem: false, now: NOW }), false);
});

test("generateTempPassword gives 16 characters drawn with crypto.randomInt from letters, digits and symbols", () => {
  const seen = new Set();
  for (let i = 0; i < 50; i += 1) {
    const value = sp.generateTempPassword();
    assert.equal(value.length, 16);
    for (const ch of value) assert.ok(sp.TEMP_PASSWORD_CHARSET.includes(ch), `unexpected ${ch}`);
    seen.add(value);
  }
  assert.equal(seen.size, 50, "values differ");
  assert.match(sp.TEMP_PASSWORD_CHARSET, /[a-z]/);
  assert.match(sp.TEMP_PASSWORD_CHARSET, /[A-Z]/);
  assert.match(sp.TEMP_PASSWORD_CHARSET, /[0-9]/);
  assert.match(sp.TEMP_PASSWORD_CHARSET, /[^A-Za-z0-9]/);
  // HTML-sensitive characters would need escaping in the email body.
  assert.doesNotMatch(sp.TEMP_PASSWORD_CHARSET, /[<>&"']/);

  const calls = [];
  const fixed = sp.generateTempPassword((max) => { calls.push(max); return 0; });
  assert.equal(fixed, sp.TEMP_PASSWORD_CHARSET[0].repeat(16));
  assert.ok(calls.every((max) => max === sp.TEMP_PASSWORD_CHARSET.length));
});

test("a usable system mailbox is not blank and not a .local placeholder", () => {
  assert.equal(sp.isUsableSystemEmail(SYSTEM_EMAIL), true);
  for (const bad of ["", "   ", undefined, null, "system-admin@tamheed.local", "X@HOST.LOCAL "]) {
    assert.equal(sp.isUsableSystemEmail(bad), false, String(bad));
    assert.ok(sp.systemEmailWarning(bad), `warns for ${bad}`);
  }
  assert.equal(sp.systemEmailWarning(SYSTEM_EMAIL), null);
});

test("maskEmail hides most of the address", () => {
  const masked = sp.maskEmail(SYSTEM_EMAIL);
  assert.equal(masked, "o***@e***.test");
  assert.ok(!masked.includes("owner-mailbox"));
  assert.equal(sp.maskEmail(""), "***");
});

test("ensureSystemAdmin sets passwordChangedAt only when it is missing", () => {
  assert.deepEqual(sp.passwordChangedAtPatch({}, NOW), { passwordChangedAt: NOW });
  assert.deepEqual(sp.passwordChangedAtPatch({ passwordChangedAt: null }, NOW), { passwordChangedAt: NOW });
  assert.deepEqual(sp.passwordChangedAtPatch({ passwordChangedAt: daysAgo(3) }, NOW), {});
});

test("ensureSystemAdmin warns when SYSTEM_ADMIN_EMAIL is blank or .local and syncs passwordChangedAt", () => {
  const source = fs.readFileSync(path.join(__dirname, "../scripts/ensureSystemAdmin.js"), "utf8");
  assert.match(source, /systemEmailWarning\(/);
  assert.match(source, /passwordChangedAtPatch\(/);
  // The real mailbox lives only in the server env, never as a default in code.
  assert.doesNotMatch(source, /@(?!tamheed\.local)[a-z0-9-]+\.(com|org|net|co\.il)/i);
});

test(".env.example keeps the placeholder mailbox and says a real one is required", () => {
  const text = fs.readFileSync(path.join(__dirname, "../config/.env.example"), "utf8");
  assert.match(text, /^SYSTEM_ADMIN_EMAIL=system-admin@tamheed\.local$/m);
  assert.match(text, /real mailbox/i);
});

/* ================= token scope ================= */

test("signAccessToken carries a scope claim when given one", () => {
  const { signAccessToken } = require("../utils/jwt");
  const token = signAccessToken({ id: "x", tz: "t", scope: sp.PASSWORD_CHANGE_SCOPE }, { expiresInSec: 600 });
  const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  assert.equal(payload.scope, "password-change");
  assert.ok(payload.exp - payload.iat <= 600);
});

test("requireAuth exposes the scope on req.user", () => {
  const { signAccessToken } = require("../utils/jwt");
  const { requireAuthAllowingPasswordChange } = require("../middleware/authMiddleware");
  const token = signAccessToken({ id: "x", tz: "t", scope: sp.PASSWORD_CHANGE_SCOPE });
  const req = { headers: { authorization: `Bearer ${token}` } };
  let passed = false;
  requireAuthAllowingPasswordChange(req, {}, () => { passed = true; });
  assert.ok(passed);
  assert.equal(req.user.scope, "password-change");
});

test("loadActor refuses a password-change token unless the route allows it", async () => {
  const { createLoadActor } = require("../middleware/permissionMiddleware");
  const find = async () => ({ tz: SYSTEM_TZ });
  const run = async (loadActor) => {
    let status = 200; let body; let passed = false;
    const res = { status(c) { status = c; return this; }, json(b) { body = b; return this; } };
    await loadActor({ user: { tz: SYSTEM_TZ, scope: "password-change" } }, res, () => { passed = true; });
    return { status, body, passed };
  };
  const refused = await run(createLoadActor({ systemTz: SYSTEM_TZ, findActiveUserByTz: find }));
  assert.equal(refused.passed, false);
  assert.equal(refused.status, 403);
  assert.equal(refused.body.code, "PASSWORD_CHANGE_REQUIRED");

  const allowed = await run(createLoadActor({ systemTz: SYSTEM_TZ, findActiveUserByTz: find, allowPasswordChange: true }));
  assert.equal(allowed.passed, true);
});

// Real routers with the real requireAuth; only the DB lookup and the
// controllers are replaced.
function mountRouter(routeFile, controllerFile, controllerExports) {
  const pm = require("../middleware/permissionMiddleware");
  const saved = { loadActor: pm.loadActor, allow: pm.loadActorAllowingPasswordChange };
  const findActiveUserByTz = async (tz) => ({ _id: "sys-id", tz, firstname: "S", lastname: "Y" });
  pm.loadActor = pm.createLoadActor({ systemTz: SYSTEM_TZ, findActiveUserByTz });
  pm.loadActorAllowingPasswordChange = pm.createLoadActor({ systemTz: SYSTEM_TZ, findActiveUserByTz, allowPasswordChange: true });
  const controllerPath = require.resolve(controllerFile);
  const routePath = require.resolve(routeFile);
  const savedController = require.cache[controllerPath];
  require.cache[controllerPath] = { id: controllerPath, filename: controllerPath, loaded: true, exports: controllerExports };
  delete require.cache[routePath];
  try {
    return require(routeFile);
  } finally {
    delete require.cache[routePath];
    if (savedController) require.cache[controllerPath] = savedController; else delete require.cache[controllerPath];
    pm.loadActor = saved.loadActor;
    pm.loadActorAllowingPasswordChange = saved.allow;
  }
}

async function listen(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

test("a password-change token is refused on GET /api/students and accepted on change-password", async () => {
  const prevTz = process.env.SYSTEM_ADMIN_TZ;
  process.env.SYSTEM_ADMIN_TZ = SYSTEM_TZ;
  const hits = [];
  const ok = (name) => (req, res) => { hits.push(name); res.json({ ok: true }); };
  const studentRouter = mountRouter("../Entities/Student/Student.route", "../Entities/Student/Student.controller", {
    getAllS: ok("students"), getOneS: ok("one"), lookupS: ok("lookup"), putS: ok("put"), deleteS: ok("del"), postS: ok("post"),
    uploadPhoto: ok("up"), deletePhoto: ok("dp"),
  });
  const authRouter = mountRouter("../Entities/User/Auth.route", "../Entities/User/User.controller", {
    register: ok("register"), login: ok("login"), refreshAccessToken: ok("refresh"), logout: ok("logout"),
    getme: ok("me"), forgotPassword: ok("forgot"), resetPassword: ok("reset"), changePassword: ok("change"),
  });
  const app = express();
  app.use(express.json());
  app.use("/api/students", studentRouter);
  app.use("/api/auth", authRouter);
  const { server, base } = await listen(app);
  try {
    const { signAccessToken } = require("../utils/jwt");
    const scoped = signAccessToken({ id: "sys-id", tz: SYSTEM_TZ, roles: [], scope: sp.PASSWORD_CHANGE_SCOPE });
    const headers = { authorization: `Bearer ${scoped}`, "content-type": "application/json" };

    const students = await fetch(`${base}/api/students`, { headers });
    assert.equal(students.status, 403);
    assert.equal((await students.json()).code, "PASSWORD_CHANGE_REQUIRED");

    const me = await fetch(`${base}/api/auth/me`, { method: "POST", headers });
    assert.equal(me.status, 403, "requireAuth-only routes refuse it too");
    assert.equal((await me.json()).code, "PASSWORD_CHANGE_REQUIRED");

    const change = await fetch(`${base}/api/auth/change-password`, { method: "POST", headers, body: "{}" });
    assert.equal(change.status, 200);
    assert.deepEqual(hits, ["change"]);

    // A normal token still reaches the students route.
    const normal = signAccessToken({ id: "sys-id", tz: SYSTEM_TZ, roles: [] });
    const res = await fetch(`${base}/api/students`, { headers: { authorization: `Bearer ${normal}` } });
    assert.equal(res.status, 200);
  } finally {
    server.close();
    if (prevTz === undefined) delete process.env.SYSTEM_ADMIN_TZ; else process.env.SYSTEM_ADMIN_TZ = prevTz;
  }
});

/* ================= controller ================= */

function loadController({ users = [], env = {}, sendThrows = false, sendHangs = false, refreshPayload = null, smtp = true } = {}) {
  const calls = { updates: [], emails: [], tokens: [], cookies: 0, increments: [], resets: [], logs: [] };
  const audit = auditStub();
  const store = users.map((u) => ({ ...u }));
  const find = (tz) => store.find((u) => String(u.tz) === String(tz));
  const dependencies = {
    bcryptjs: require("bcryptjs"),
    jsonwebtoken: { verify: () => refreshPayload },
    path,
    "./User.model": {
      UserModelDef: {
        async get(filter, room = "active") {
          if (room !== "active") return { success: true, result: [] };
          const hit = filter.tz !== undefined ? find(filter.tz) : undefined;
          return { success: true, result: hit ? [{ ...hit }] : [] };
        },
        async update(filter, data, room) {
          calls.updates.push([filter, data, room]);
          const hit = find(filter.tz);
          if (hit) Object.assign(hit, data);
          return { success: true };
        },
        async incrementFailedLogin(tz, room) {
          calls.increments.push([tz, room]);
          const hit = find(tz);
          hit.failedLoginCount = (Number(hit.failedLoginCount) || 0) + 1;
          return { success: true, result: { ...hit } };
        },
        async lockIfThresholdReached(tz, lockedAt, threshold) {
          calls.locks = (calls.locks || []).concat([[tz, threshold]]);
          const hit = find(tz);
          if (!hit || hit.lockedAt || hit.failedLoginCount < threshold) return { success: true, result: null };
          hit.lockedAt = lockedAt;
          return { success: true, result: { ...hit } };
        },
      },
    },
    "../../utils/otp": require("../utils/otp"),
    "../../utils/sendEmail": {
      sendResetPasswordEmail: async (to, otp) => { calls.resets.push({ to, otp }); },
      smtpConfigured: () => smtp,
      sendSystemAdminEmail: async (to, message) => {
        if (sendThrows) throw new Error("smtp down");
        if (sendHangs) { calls.emails.push({ to, ...message }); return new Promise(() => {}); }
        calls.emails.push({ to, ...message });
      },
    },
    "../../utils/jwt": {
      signAccessToken: (payload, options) => { calls.tokens.push({ payload, options }); return `access-${calls.tokens.length}`; },
      signRefreshToken: () => "refresh",
      setRefreshCookie() { calls.cookies += 1; },
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
    "../../utils/systemPassword": sp,
    "../../middleware/logger": { logWithSource(source, error) { calls.logs.push({ source, message: String(error?.message || error) }); } },
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
    ...audit.deps,
  };
  const filename = path.join(__dirname, "../Entities/User/User.controller.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    console: { log() {}, warn() {}, error() {} },
    process: { env: { ...process.env, SYSTEM_ADMIN_TZ: SYSTEM_TZ, SYSTEM_ADMIN_EMAIL: SYSTEM_EMAIL, ...env } },
    require(name) {
      if (!Object.hasOwn(dependencies, name) && Object.hasOwn(live.deps, name)) return live.deps[name];
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return { controller: module.exports, calls, audit, store, find };
}

const makeRes = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(value) { this.body = JSON.parse(JSON.stringify(value)); return this; },
  cookie() { return this; },
});

const systemUser = (extra = {}) => ({
  _id: "sys-id", tz: SYSTEM_TZ, firstname: "Sys", lastname: "Tem", roles: ["ادارة"],
  password: "enc:current-pass-1", failedLoginCount: 0, lockedAt: null, ...extra,
});
const ADMIN = {
  _id: "adm-id", tz: "admin-1", firstname: "Ad", lastname: "Min", role: "ادارة", roles: ["ادارة"],
  permissionGrants: ["systemRecovery.reset"], password: "enc:admin-pass-1",
};

async function login(ctx, tz, password) {
  const res = makeRes();
  await ctx.controller.login({ body: { tz, password }, headers: {}, cookies: {}, ip: "127.0.0.1" }, res);
  return res;
}

test("system login within 30 days is a normal login with a refresh cookie", async () => {
  const ctx = loadController({ users: [systemUser({ passwordChangedAt: new Date(Date.now() - 29 * DAY) })] });
  const res = await login(ctx, SYSTEM_TZ, "current-pass-1");
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.mustChangePassword, undefined);
  assert.equal(ctx.calls.cookies, 1);
  assert.equal(ctx.calls.tokens[0].payload.scope, undefined);
});

test("system login after 31 days gets only a password-change token and no refresh cookie", async () => {
  const ctx = loadController({ users: [systemUser({ passwordChangedAt: new Date(Date.now() - 31 * DAY), refreshHash: "old" })] });
  const res = await login(ctx, SYSTEM_TZ, "current-pass-1");
  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ["accessToken", "mustChangePassword", "ok"]);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.mustChangePassword, true);
  assert.equal(ctx.calls.tokens.length, 1);
  assert.equal(ctx.calls.tokens[0].payload.scope, "password-change");
  assert.equal(res.body.accessToken, "access-1");
  assert.equal(ctx.calls.cookies, 0, "no refresh cookie");
  assert.equal(ctx.find(SYSTEM_TZ).refreshHash, null, "older refresh tokens stop working");
});

test("an ordinary account is never forced to change, whatever its age", async () => {
  const user = { ...ADMIN, passwordChangedAt: new Date(0) };
  const ctx = loadController({ users: [user] });
  const res = await login(ctx, ADMIN.tz, "admin-pass-1");
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.mustChangePassword, undefined);
  assert.equal(ctx.calls.cookies, 1);
});

test("refresh is refused for the system account once its password has expired", async () => {
  const ctx = loadController({
    users: [systemUser({ passwordChangedAt: new Date(0), refreshHash: "sha:tok" })],
    refreshPayload: { tz: SYSTEM_TZ },
  });
  const res = makeRes();
  res.clearCookie = () => res;
  await ctx.controller.refreshAccessToken({ cookies: { refresh: "tok" } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "PASSWORD_CHANGE_REQUIRED");
  assert.equal(ctx.calls.tokens.length, 0, "no new token");
  assert.equal(ctx.calls.cookies, 0);

  const fresh = loadController({
    users: [systemUser({ passwordChangedAt: new Date(), refreshHash: "sha:tok" })],
    refreshPayload: { tz: SYSTEM_TZ },
  });
  const ok = makeRes();
  await fresh.controller.refreshAccessToken({ cookies: { refresh: "tok" } }, ok);
  assert.equal(ok.statusCode, 200);
});

async function changePassword(ctx, actorUser, body) {
  const res = makeRes();
  const req = { body, actor: actorFor(ctx.find(actorUser.tz) || actorUser, { isSystem: actorUser.tz === SYSTEM_TZ }), ip: "127.0.0.1", user: { tz: actorUser.tz } };
  await ctx.controller.changePassword(req, res);
  return res;
}

test("change-password checks the current password and the new one", async () => {
  const ctx = loadController({ users: [systemUser({ passwordChangedAt: new Date(0) })] });
  const sys = ctx.find(SYSTEM_TZ);
  assert.equal((await changePassword(ctx, sys, {})).statusCode, 400);
  const wrong = await changePassword(ctx, sys, { currentPassword: "nope", newPassword: "brand-new-pass-9" });
  assert.equal(wrong.statusCode, 400);
  assert.equal(wrong.body.code, "WRONG_PASSWORD");
  const short = await changePassword(ctx, sys, { currentPassword: "current-pass-1", newPassword: "short" });
  assert.equal(short.statusCode, 400);
  assert.equal(short.body.code, "PASSWORD_TOO_SHORT");
  const same = await changePassword(ctx, sys, { currentPassword: "current-pass-1", newPassword: "current-pass-1" });
  assert.equal(same.statusCode, 400);
  assert.equal(same.body.code, "PASSWORD_SAME");
  assert.equal(ctx.calls.updates.length, 0);
});

test("change-password stores the new password, sets passwordChangedAt and audits without the value", async () => {
  const ctx = loadController({ users: [systemUser({ passwordChangedAt: new Date(0), failedLoginCount: 2 })] });
  const before = Date.now();
  const res = await changePassword(ctx, ctx.find(SYSTEM_TZ), { currentPassword: "current-pass-1", newPassword: "brand-new-pass-9" });
  assert.equal(res.statusCode, 200);
  // A fresh session: older tokens are now stale (fix round 1).
  assert.equal(res.body.ok, true);
  assert.equal(typeof res.body.accessToken, "string");
  assert.equal(ctx.calls.tokens.at(-1).payload.scope, undefined);
  assert.equal(ctx.calls.cookies, 1, "a new refresh cookie");
  const stored = ctx.find(SYSTEM_TZ);
  assert.equal(stored.password, "enc:brand-new-pass-9");
  assert.ok(new Date(stored.passwordChangedAt).getTime() >= before);
  assert.equal(stored.failedLoginCount, 0);
  assert.equal(sp.mustChangePassword(stored, { isSystem: true }), false);

  const rows = ctx.audit.find({ action: "update" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].module, "users");
  assert.equal(rows[0].after.password, "***");
  const text = JSON.stringify(ctx.audit.calls.map(({ req, ...entry }) => entry));
  assert.ok(!text.includes("brand-new-pass-9") && !text.includes("current-pass-1"), "no password in the audit entry");

  // The next login is a normal one.
  const next = await login(ctx, SYSTEM_TZ, "brand-new-pass-9");
  assert.equal(next.body.mustChangePassword, undefined);
});

test("a reset by emailed code also restarts the password-age clock", async () => {
  const ctx = loadController({ users: [systemUser({
    passwordChangedAt: new Date(0), resetOtpHash: "sha:123456", resetOtpExpires: new Date(Date.now() + 60000),
  })] });
  const res = makeRes();
  await ctx.controller.resetPassword({ body: {
    tz: SYSTEM_TZ, otp: "123456", newPassword: "brand-new-pass-9", confirmPassword: "brand-new-pass-9",
  } }, res);
  assert.equal(res.body.ok, true);
  assert.equal(sp.mustChangePassword(ctx.find(SYSTEM_TZ), { isSystem: true }), false);
});

async function recover(ctx, actorUser = ADMIN) {
  const res = makeRes();
  await ctx.controller.recoverSystem({ body: {}, params: {}, actor: actorFor(actorUser), ip: "127.0.0.1" }, res);
  return res;
}

test("recovery is refused with 409 while the system account has fewer than 3 failures", async () => {
  const ctx = loadController({ users: [systemUser({ failedLoginCount: 2 }), ADMIN] });
  const res = await recover(ctx);
  assert.equal(res.statusCode, 409);
  assert.equal(ctx.calls.emails.length, 0);
  assert.equal(ctx.calls.updates.length, 0);
});

test("recovery with 3 failures emails a temporary password to SYSTEM_ADMIN_EMAIL only and answers { ok: true }", async () => {
  const ctx = loadController({ users: [systemUser({ failedLoginCount: 3, passwordChangedAt: daysAgo(2) }), ADMIN] });
  const res = await recover(ctx);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });

  assert.equal(ctx.calls.emails.length, 1);
  const mail = ctx.calls.emails[0];
  assert.equal(mail.to, SYSTEM_EMAIL);
  const stored = ctx.find(SYSTEM_TZ);
  const temp = stored.password.replace(/^enc:/, "");
  assert.equal(temp.length, 16);
  assert.ok(mail.text.includes(temp), "email carries the temporary password");
  assert.ok(!JSON.stringify(res.body).includes(temp), "response never carries it");
  assert.equal(new Date(stored.passwordChangedAt).getTime(), 0, "forces a change at next login");
  assert.equal(stored.failedLoginCount, 0);

  const rows = ctx.audit.find({ action: "system_recovery" });
  assert.equal(rows.length, 1);
  assert.ok(!JSON.stringify(ctx.audit.calls.map(({ req, ...e }) => e)).includes(temp), "audit never carries it");

  // Signing in with the temporary password leads to the forced change.
  const next = await login(ctx, SYSTEM_TZ, temp);
  assert.equal(next.body.mustChangePassword, true);
});

test("recovery is refused, and nothing changes, when the system mailbox is not usable", async () => {
  for (const email of ["", "system-admin@tamheed.local"]) {
    const ctx = loadController({ users: [systemUser({ failedLoginCount: 5 }), ADMIN], env: { SYSTEM_ADMIN_EMAIL: email } });
    const res = await recover(ctx);
    assert.equal(res.statusCode, 503, email);
    assert.equal(res.body.code, "EMAIL_NOT_CONFIGURED");
    assert.equal(ctx.calls.updates.length, 0);
    assert.equal(ctx.calls.emails.length, 0);
  }
});

test("recovery leaves the password untouched when the email cannot be sent", async () => {
  const ctx = loadController({ users: [systemUser({ failedLoginCount: 4 }), ADMIN], sendThrows: true });
  const res = await recover(ctx);
  assert.equal(res.statusCode, 502);
  assert.equal(res.body.code, "EMAIL_FAILED");
  assert.equal(ctx.find(SYSTEM_TZ).password, "enc:current-pass-1");
  assert.equal(ctx.find(SYSTEM_TZ).failedLoginCount, 4);
  assert.equal(ctx.calls.updates.length, 0);
  assert.equal(ctx.audit.calls.length, 0);
});

test("a failing alert email never changes the failed-login answer", async () => {
  const ctx = loadController({ users: [systemUser({ failedLoginCount: 4 })], sendThrows: true });
  const res = await login(ctx, SYSTEM_TZ, "wrong");
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "INVALID_CREDENTIALS");
});

test("every 5th consecutive system failure sends one alert email; the 6th does not", async () => {
  const ctx = loadController({ users: [systemUser({ failedLoginCount: 3 })] });
  await login(ctx, SYSTEM_TZ, "wrong-1"); // 4
  assert.equal(ctx.calls.emails.length, 0);
  const fifth = await login(ctx, SYSTEM_TZ, "wrong-2"); // 5
  assert.equal(fifth.statusCode, 401);
  assert.equal(ctx.calls.emails.length, 1);
  assert.equal(ctx.calls.emails[0].to, SYSTEM_EMAIL);
  assert.equal(ctx.calls.emails[0].subject, "5 failed sign-in attempts on the system account");
  await login(ctx, SYSTEM_TZ, "wrong-3"); // 6
  assert.equal(ctx.calls.emails.length, 1, "no alert on the 6th");
  for (let i = 0; i < 4; i += 1) await login(ctx, SYSTEM_TZ, "wrong-x"); // 7..10
  assert.equal(ctx.calls.emails.length, 2, "again on the 10th");
});

test("an ordinary account's 5th failure sends no alert email", async () => {
  const ctx = loadController({ users: [{ ...ADMIN, failedLoginCount: 4 }] });
  await login(ctx, ADMIN.tz, "wrong");
  assert.equal(ctx.calls.emails.length, 0);
});

/* ================= IT script ================= */

test("the IT script resets without the 3-failure condition, emails, and audits as it-server", async () => {
  const { systemRecover, IT_ACTOR } = require("../scripts/systemRecover");
  assert.deepEqual(IT_ACTOR, { tz: "it-server", name: "IT (خادم)" });

  const updates = [];
  const emails = [];
  const audits = [];
  const model = {
    async get(filter, room) {
      return { success: true, result: room === "active" && filter.tz === SYSTEM_TZ ? [systemUser({ failedLoginCount: 0 })] : [] };
    },
    async update(filter, data, room) { updates.push({ filter, data, room }); return { success: true }; },
  };
  const result = await systemRecover({
    model,
    systemTz: SYSTEM_TZ,
    email: SYSTEM_EMAIL,
    send: async (to, message) => { emails.push({ to, ...message }); },
    encrypt: (v) => `enc:${v}`,
    audit: { record: async (req, entry) => { audits.push({ req, entry }); } },
  });
  assert.equal(result.ok, true);
  assert.equal(result.maskedEmail, "o***@e***.test");
  assert.ok(!JSON.stringify(result).includes(SYSTEM_EMAIL));

  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, SYSTEM_EMAIL);
  assert.equal(updates.length, 1);
  const temp = updates[0].data.password.replace(/^enc:/, "");
  assert.ok(emails[0].text.includes(temp));
  assert.ok(!JSON.stringify(result).includes(temp), "the result (printed) never carries the password");
  assert.equal(new Date(updates[0].data.passwordChangedAt).getTime(), 0);
  assert.equal(updates[0].data.failedLoginCount, 0);

  assert.equal(audits.length, 1);
  assert.equal(audits[0].entry.action, "system_recovery");
  assert.deepEqual(audits[0].req.actor, IT_ACTOR);
  assert.ok(!JSON.stringify(audits[0].entry).includes(temp));

  const { actorLabel } = require("../middleware/permissionMiddleware");
  assert.deepEqual(actorLabel(audits[0].req.actor), { actor: "it-server", actorName: "IT (خادم)" });
});

test("the IT script refuses an unusable mailbox or a missing system account and changes nothing", async () => {
  const { systemRecover } = require("../scripts/systemRecover");
  const updates = [];
  const model = {
    async get() { return { success: true, result: [] }; },
    async update(...a) { updates.push(a); return { success: true }; },
  };
  const send = async () => assert.fail("no email");
  const audit = { record: async () => assert.fail("no audit") };
  const noMailbox = await systemRecover({ model, systemTz: SYSTEM_TZ, email: "x@host.local", send, encrypt: String, audit });
  assert.equal(noMailbox.ok, false);
  assert.equal(noMailbox.reason, "email-not-configured");
  const missing = await systemRecover({ model, systemTz: SYSTEM_TZ, email: SYSTEM_EMAIL, send, encrypt: String, audit });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, "no-system-account");
  assert.equal(updates.length, 0);
});

test("the IT script is wired as npm run system:recover", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"), "utf8"));
  assert.equal(pkg.scripts["system:recover"], "node scripts/systemRecover.js");
});

/* ================= fix round 1 ================= */

const GUIDE = {
  _id: "g1", tz: "guide-1", firstname: "Gu", lastname: "Ide", role: "مرشد", roles: ["مرشد"],
  password: "enc:guide-pass-1", failedLoginCount: 0, lockedAt: null,
};
const KEY_ADMIN = { ...ADMIN, permissionGrants: ["users.passwords"] };
const sec = (date) => Math.floor(new Date(date).getTime() / 1000);

async function putU(ctx, actorUser, tz, body) {
  const res = makeRes();
  await ctx.controller.putU({ params: { tz }, body, actor: actorFor(actorUser), ip: "127.0.0.1", user: { tz: actorUser.tz } }, res);
  return res;
}

test("fix1: a self edit through putU ignores the password and never stamps passwordChangedAt", async () => {
  const ctx = loadController({ users: [GUIDE] });
  const res = await putU(ctx, GUIDE, GUIDE.tz, { firstname: "New", password: "another-pass-9" });
  assert.equal(res.statusCode, 200);
  const stored = ctx.find(GUIDE.tz);
  assert.equal(stored.firstname, "New");
  assert.equal(stored.password, "enc:guide-pass-1", "own password changes only through change-password");
  assert.equal(stored.passwordChangedAt, undefined);
});

test("fix1: a users.passwords holder setting another user's password stamps passwordChangedAt", async () => {
  const ctx = loadController({ users: [GUIDE, KEY_ADMIN] });
  const before = Date.now();
  const res = await putU(ctx, KEY_ADMIN, GUIDE.tz, { password: "another-pass-9" });
  assert.equal(res.statusCode, 200);
  const stored = ctx.find(GUIDE.tz);
  assert.equal(stored.password, "another-pass-9");
  assert.ok(new Date(stored.passwordChangedAt).getTime() >= before);
});

test("fix2: a wrong current password counts as a failed sign-in and locks at 5", async () => {
  const ctx = loadController({ users: [{ ...GUIDE, failedLoginCount: 4 }] });
  const wrong = await changePassword(ctx, GUIDE, { currentPassword: "nope-nope", newPassword: "brand-new-pass-9" });
  assert.equal(wrong.statusCode, 400);
  assert.equal(wrong.body.code, "WRONG_PASSWORD");
  const stored = ctx.find(GUIDE.tz);
  assert.equal(stored.failedLoginCount, 5);
  assert.ok(stored.lockedAt, "locked at the fifth failure");
  assert.equal(ctx.audit.find({ action: "lock" }).length, 1);

  const locked = await changePassword(ctx, GUIDE, { currentPassword: "guide-pass-1", newPassword: "brand-new-pass-9" });
  assert.equal(locked.statusCode, 423);
  assert.equal(locked.body.code, "ACCOUNT_LOCKED");
  assert.equal(ctx.find(GUIDE.tz).password, "enc:guide-pass-1");
});

test("fix2: the system account's 5th wrong current password alerts and never locks", async () => {
  const ctx = loadController({ users: [systemUser({ failedLoginCount: 4, passwordChangedAt: new Date() })] });
  const res = await changePassword(ctx, ctx.find(SYSTEM_TZ), { currentPassword: "nope-nope", newPassword: "brand-new-pass-9" });
  assert.equal(res.statusCode, 400);
  assert.equal(ctx.find(SYSTEM_TZ).failedLoginCount, 5);
  assert.equal(ctx.find(SYSTEM_TZ).lockedAt, null);
  assert.equal(ctx.calls.emails.length, 1);
  assert.equal(ctx.calls.emails[0].subject, "5 failed sign-in attempts on the system account");
});

test("fix3: tokenIsStale compares whole seconds against passwordChangedAt and recoveredAt", () => {
  const changed = new Date("2026-10-19T10:00:05.500Z");
  assert.equal(sp.tokenIsStale(sec("2026-10-19T10:00:04Z"), { passwordChangedAt: changed }), true);
  assert.equal(sp.tokenIsStale(sec(changed), { passwordChangedAt: changed }), false, "issued right after the change");
  assert.equal(sp.tokenIsStale(undefined, { passwordChangedAt: changed }), false, "no iat: nothing to compare");
  assert.equal(sp.tokenIsStale(sec("2026-10-19T09:00:00Z"), {}), false);
  assert.equal(sp.tokenIsStale(sec("2026-10-19T10:00:04Z"), { passwordChangedAt: new Date(0), recoveredAt: changed }), true);
});

test("fix3: loadActor answers 401 TOKEN_STALE for a token older than the password", async () => {
  const { createLoadActor } = require("../middleware/permissionMiddleware");
  const changed = new Date("2026-10-19T10:00:05.500Z");
  const loadActor = createLoadActor({ systemTz: SYSTEM_TZ, findActiveUserByTz: async () => ({ tz: "u1", role: "مرشد", passwordChangedAt: changed }) });
  const run = async (iat) => {
    let status = 200; let body; let passed = false;
    const res = { status(c) { status = c; return this; }, json(b) { body = b; return this; } };
    await loadActor({ user: { tz: "u1", iat } }, res, () => { passed = true; });
    return { status, body, passed };
  };
  const stale = await run(sec("2026-10-19T10:00:00Z"));
  assert.equal(stale.status, 401);
  assert.equal(stale.body.code, "TOKEN_STALE");
  assert.equal((await run(sec(changed))).passed, true);
});

test("fix3: requireAuth passes iat on to loadActor", () => {
  const { signAccessToken } = require("../utils/jwt");
  const { requireAuth } = require("../middleware/authMiddleware");
  const req = { headers: { authorization: "Bearer " + signAccessToken({ id: "x", tz: "t" }) } };
  requireAuth(req, {}, () => {});
  assert.equal(typeof req.user.iat, "number");
});

test("fix3: refresh and /me refuse a token older than the password", async () => {
  const user = systemUser({ passwordChangedAt: new Date(), refreshHash: "sha:tok" });
  const oldIat = sec(Date.now() - 60 * 60 * 1000);
  const ctx = loadController({ users: [user], refreshPayload: { tz: SYSTEM_TZ, iat: oldIat } });
  const res = makeRes();
  res.clearCookie = () => res;
  await ctx.controller.refreshAccessToken({ cookies: { refresh: "tok" } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "TOKEN_STALE");
  assert.equal(ctx.calls.tokens.length, 0);

  const me = makeRes();
  await ctx.controller.getme({ user: { tz: SYSTEM_TZ, iat: oldIat } }, me);
  assert.equal(me.statusCode, 401);
  assert.equal(me.body.code, "TOKEN_STALE");
  const fresh = makeRes();
  await ctx.controller.getme({ user: { tz: SYSTEM_TZ, iat: sec(Date.now()) } }, fresh);
  assert.equal(fresh.statusCode, 200);
});

test("fix3: recovery ends existing sessions; a token issued after it is fine", async () => {
  const ctx = loadController({ users: [systemUser({ failedLoginCount: 3, passwordChangedAt: daysAgo(2) }), ADMIN] });
  const iatBefore = sec(Date.now()) - 5;
  assert.equal((await recover(ctx)).statusCode, 200);
  const stored = ctx.find(SYSTEM_TZ);
  assert.equal(sp.tokenIsStale(iatBefore, stored), true);
  assert.equal(sp.tokenIsStale(sec(Date.now()), stored), false);
});

test("fix3: Google Drive routes also go through loadActor", () => {
  const source = fs.readFileSync(path.join(__dirname, "../Entities/Storage/GoogleDrive.route.js"), "utf8");
  assert.match(source, /requireAuth:\s*\[requireAuth,\s*loadActor\]/);
});

test("minor: a second recovery within 10 minutes answers 429", async () => {
  const ctx = loadController({ users: [systemUser({ failedLoginCount: 3 }), ADMIN] });
  assert.equal((await recover(ctx)).statusCode, 200);
  ctx.find(SYSTEM_TZ).failedLoginCount = 3;
  const again = await recover(ctx);
  assert.equal(again.statusCode, 429);
  assert.equal(again.body.code, "RECOVERY_COOLDOWN");
  assert.equal(ctx.calls.emails.length, 1);
  ctx.find(SYSTEM_TZ).recoveredAt = new Date(Date.now() - 11 * 60 * 1000);
  assert.equal((await recover(ctx)).statusCode, 200);
});

test("minor: /system/recover is rate-limited", () => {
  const source = fs.readFileSync(path.join(__dirname, "../Entities/User/User.route.js"), "utf8");
  // The permission check runs first: non-holders never use up the budget.
  assert.match(source, /router\.post\('\/system\/recover',\s*requirePermission\('systemRecovery\.reset'\),\s*recoverRateLimit,\s*recoverSystem\)/);
  assert.match(source, /recoverRateLimit = rateLimit\(/);
});

test("minor: reset-password (emailed code) applies the new-password rule", async () => {
  const ctx = loadController({ users: [{ ...GUIDE, resetOtpHash: "sha:123456", resetOtpExpires: new Date(Date.now() + 60000) }] });
  const res = makeRes();
  await ctx.controller.resetPassword({ body: { tz: GUIDE.tz, otp: "123456", newPassword: "short", confirmPassword: "short" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "PASSWORD_TOO_SHORT");
  assert.equal(ctx.calls.updates.length, 0);
});

test("minor: the lockout alert does not hold up the 401", async () => {
  const ctx = loadController({ users: [systemUser({ failedLoginCount: 4 })], sendHangs: true });
  const outcome = await Promise.race([
    login(ctx, SYSTEM_TZ, "wrong").then((res) => res.statusCode),
    new Promise((resolve) => setTimeout(() => resolve("timeout"), 500)),
  ]);
  assert.equal(outcome, 401);
  assert.equal(ctx.calls.emails.length, 1);
});

/* ================= final review fixes ================= */

const STORED_EMAIL = "stale-profile@example.test";
const otpUser = (extra = {}) => systemUser({ email: STORED_EMAIL, passwordChangedAt: new Date(), ...extra });

async function forgot(ctx, tz) {
  const res = makeRes();
  await ctx.controller.forgotPassword({ body: { tz }, ip: "127.0.0.1" }, res);
  return res;
}

test("final1: forgot-password for the system account sends the code to SYSTEM_ADMIN_EMAIL, never to the stored email", async () => {
  const ctx = loadController({ users: [otpUser()] });
  const res = await forgot(ctx, SYSTEM_TZ);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(ctx.calls.resets.length, 1);
  assert.equal(ctx.calls.resets[0].to, SYSTEM_EMAIL);
  assert.ok(!JSON.stringify(ctx.calls.resets).includes(STORED_EMAIL));
  assert.equal(ctx.find(SYSTEM_TZ).resetOtpHash, `sha:${ctx.calls.resets[0].otp}`);
});

test("final1: an ordinary account's code still goes to its own email", async () => {
  const ctx = loadController({ users: [{ ...GUIDE, email: "guide@example.test" }] });
  const res = await forgot(ctx, GUIDE.tz);
  assert.equal(res.body.ok, true);
  assert.deepEqual(ctx.calls.resets.map((r) => r.to), ["guide@example.test"]);
});

test("final1: with no usable system mailbox, forgot-password answers the same, sends nothing and logs a warning", async () => {
  const reference = await forgot(loadController({ users: [otpUser()] }), SYSTEM_TZ);
  const cases = [
    { env: { SYSTEM_ADMIN_EMAIL: "" } },
    { env: { SYSTEM_ADMIN_EMAIL: "system-admin@tamheed.local" } },
    { smtp: false },
  ];
  for (const options of cases) {
    const ctx = loadController({ users: [otpUser()], ...options });
    const res = await forgot(ctx, SYSTEM_TZ);
    assert.equal(res.statusCode, reference.statusCode);
    assert.deepEqual(res.body, reference.body, "same answer as a sent email");
    assert.equal(ctx.calls.resets.length, 0, "nothing sent");
    assert.equal(ctx.calls.updates.length, 0, "no unusable code is stored");
    assert.ok(ctx.calls.logs.some((l) => /SYSTEM_ADMIN_EMAIL/.test(l.message)), "a warning is logged");
  }
});

test("final1: the system account editing itself cannot change its stored email; others still can", async () => {
  const ctx = loadController({ users: [otpUser()] });
  const res = makeRes();
  const sys = ctx.find(SYSTEM_TZ);
  await ctx.controller.putU({
    params: { tz: SYSTEM_TZ }, body: { firstname: "New", email: "elsewhere@example.test" },
    actor: actorFor(sys, { isSystem: true }), ip: "127.0.0.1", user: { tz: SYSTEM_TZ },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(ctx.find(SYSTEM_TZ).firstname, "New");
  assert.equal(ctx.find(SYSTEM_TZ).email, STORED_EMAIL);

  const guideCtx = loadController({ users: [{ ...GUIDE, email: "guide@example.test" }] });
  await putU(guideCtx, GUIDE, GUIDE.tz, { email: "guide-new@example.test" });
  assert.equal(guideCtx.find(GUIDE.tz).email, "guide-new@example.test");
});

test("final2: reset-password rule rejections carry a readable Arabic message", async () => {
  for (const [newPassword, code, pattern] of [
    ["short", "PASSWORD_TOO_SHORT", /8/],
    ["x".repeat(129), "PASSWORD_TOO_LONG", /128/],
  ]) {
    const ctx = loadController({ users: [{ ...GUIDE, resetOtpHash: "sha:123456", resetOtpExpires: new Date(Date.now() + 60000) }] });
    const res = makeRes();
    await ctx.controller.resetPassword({ body: { tz: GUIDE.tz, otp: "123456", newPassword, confirmPassword: newPassword } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, code);
    assert.equal(typeof res.body.message, "string");
    assert.match(res.body.message, /[؀-ۿ]/, "Arabic");
    assert.match(res.body.message, pattern);
    assert.equal(ctx.calls.updates.length, 0);
  }
});

test("final3: the system alert never fires on a zero or unreadable count", () => {
  const { afterFailureCount } = require("../utils/loginLockout");
  for (const count of [0, undefined, null, "x", -5]) {
    assert.equal(afterFailureCount(count, { isSystem: true }).alertSystem, false, String(count));
  }
  assert.equal(afterFailureCount(5, { isSystem: true }).alertSystem, true);
  assert.equal(afterFailureCount(10, { isSystem: true }).alertSystem, true);
  assert.equal(afterFailureCount(5, { isSystem: false }).alertSystem, false);
});

function loadEnsureSystemAdmin({ users = [], env = {}, smtp = true } = {}) {
  const calls = { creates: [], updates: [], warnings: [] };
  const store = users.map((u) => ({ ...u }));
  const model = {
    async get(filter, room) {
      return { success: true, result: room === "active" ? store.filter((u) => u.tz === filter.tz) : [] };
    },
    async update(filter, data, room) { calls.updates.push({ filter, data, room }); return { success: true }; },
    async create(data, room) { calls.creates.push({ data, room }); return { success: true }; },
  };
  const dependencies = {
    "../Entities/User/User.model": { UserModelDef: model },
    "../Entities/Storage/Storage.controller": { ensureUserStorageFolder: async () => {} },
    "../utils/systemPassword": sp,
    "../utils/sendEmail": { smtpConfigured: () => smtp },
  };
  const filename = path.join(__dirname, "../scripts/ensureSystemAdmin.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, Date, Promise,
    console: { log() {}, error() {}, warn(message) { calls.warnings.push(String(message)); } },
    process: { env: {
      SYSTEM_ADMIN_TZ: SYSTEM_TZ, SYSTEM_ADMIN_PASSWORD: "test-only-pass-1", SYSTEM_ADMIN_EMAIL: SYSTEM_EMAIL, ...env,
    } },
    require(name) {
      if (!Object.hasOwn(dependencies, name) && Object.hasOwn(live.deps, name)) return live.deps[name];
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return { ensureSystemAdmin: module.exports.ensureSystemAdmin, calls };
}

test("final4: a newly created system account must change its password at first sign-in", async () => {
  const { ensureSystemAdmin, calls } = loadEnsureSystemAdmin();
  const result = await ensureSystemAdmin();
  assert.equal(result.created, true);
  assert.equal(calls.creates.length, 1);
  assert.equal(new Date(calls.creates[0].data.passwordChangedAt).getTime(), 0);
  assert.equal(sp.mustChangePassword(calls.creates[0].data, { isSystem: true }), true);
});

test("final4: an existing system account without a date is forced to change; a valid date is kept", async () => {
  for (const missing of [undefined, null, "garbage"]) {
    const { ensureSystemAdmin, calls } = loadEnsureSystemAdmin({ users: [systemUser({ passwordChangedAt: missing })] });
    await ensureSystemAdmin();
    assert.equal(calls.updates.length, 1);
    assert.equal(new Date(calls.updates[0].data.passwordChangedAt).getTime(), 0, String(missing));
  }
  const kept = daysAgo(3);
  const { ensureSystemAdmin, calls } = loadEnsureSystemAdmin({ users: [systemUser({ passwordChangedAt: kept })] });
  await ensureSystemAdmin();
  assert.equal(Object.hasOwn(calls.updates[0].data, "passwordChangedAt"), false, "a valid date is untouched");
});

test("final4: startup warns when SMTP is not configured, and not when it is", async () => {
  const off = loadEnsureSystemAdmin({ smtp: false });
  await off.ensureSystemAdmin();
  assert.ok(off.calls.warnings.some((w) => /SMTP/.test(w)), "SMTP warning");
  const on = loadEnsureSystemAdmin({ smtp: true });
  await on.ensureSystemAdmin();
  assert.deepEqual(on.calls.warnings, []);
});
