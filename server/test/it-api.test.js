// The IT API (IT-site design, "Who may do what", "Screens of the IT site"):
// every route behind requireIt on IT_HOST, the everyday handlers reused with
// the IT actor, members managed by the system account only.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const express = require("express");
const cookieParser = require("cookie-parser");
const jwt = require("jsonwebtoken");

process.env.PASSWORD_ENC_KEY_HEX = process.env.PASSWORD_ENC_KEY_HEX || "0".repeat(64);
process.env.IT_SESSION_SECRET = "test-it-session-secret";
process.env.IT_HOST = "it.example.test";

const live = require("./helpers/liveStubs");
const { auditStub } = require("./helpers/auditStub");
const { createItRouter } = require("../Entities/It/It.route");
const { createItAuth } = require("../Entities/It/It.auth");
const { createItMembers } = require("../Entities/It/ItMembers.controller");
const { createRequireIt, IT_COOKIE } = require("../middleware/requireIt");
const { createDriveConnectState } = require("../utils/driveConnectState");
const { createGoogleDriveRouter } = require("../Entities/Storage/GoogleDrive.route");
const { createRoleDefaults } = require("../Entities/It/RoleDefaults.controller");
const { setRoleDefaultsOverride } = require("../utils/permissions");

// Synthetic values only.
const SYSTEM_TZ = "900000001";
const IT_HOST = "it.example.test";
const SECRET = "test-it-session-secret";
const LONG_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

const SYS = { _id: "s0", tz: SYSTEM_TZ, firstname: "System", lastname: "Admin", email: "system@example.test", isIT: true, role: null, roles: [], failedLoginCount: 0 };
const IT_A = { _id: "i1", tz: "100000009", firstname: "It", lastname: "Alpha", email: "it.a@example.test", isIT: true, itSince: LONG_AGO, roles: ["مرشد"], role: "مرشد" };
const IT_B = { _id: "i2", tz: "100000017", firstname: "It", lastname: "Beta", email: "it.b@example.test", isIT: true, itSince: LONG_AGO, roles: ["مساعد"], role: "مساعد", password: "it-b-placeholder" };
const IT_C = { _id: "i3", tz: "100000025", firstname: "It", lastname: "Locked", email: "it.c@example.test", isIT: true, itSince: LONG_AGO, roles: ["مساعد"], role: "مساعد", lockedAt: new Date(), failedLoginCount: 5 };
const GUIDE = {
  _id: "g1", tz: "200000008", firstname: "Gu", lastname: "Ide", email: "guide@example.test", roles: ["مرشد"], role: "مرشد",
  password: "guide-placeholder", photo: "https://example.test/g.jpg", lockedAt: new Date(), failedLoginCount: 5,
  refreshHash: null, refreshHashes: ["h1", "h2"],
  deviceTokens: [
    { sid: "sid-1", hash: "h1", label: "Chrome", startedAt: new Date(), lastSeenAt: new Date() },
    { sid: "sid-2", hash: "h2", label: "Phone", startedAt: new Date(), lastSeenAt: new Date() },
  ],
  resetOtpHash: "otp-placeholder",
};
const NO_MAIL = { _id: "n1", tz: "300000007", firstname: "No", lastname: "Mail", email: "test@test.com", roles: ["مساعد"], role: "مساعد" };
const EMPTY_MAIL = { _id: "n2", tz: "300000015", firstname: "Empty", lastname: "Mail", email: "", roles: ["مساعد"], role: "مساعد" };
const ADMIN = { _id: "a1", tz: "400000006", firstname: "Ad", lastname: "Min", email: "admin@example.test", roles: ["ادارة"], role: "ادارة" };
const WAITING = { _id: "w1", tz: "500000004", firstname: "Wa", lastname: "Iting", email: "w@example.test" };

// Room-aware in-memory UserModelDef (as in user-it-protection.test.js).
function createUsers(seed) {
  const rooms = { active: [], waiting: [], noActive: [], ...structuredClone(seed) };
  // Equality, null, and the $regex the tz-uniqueness check uses.
  const matches = (doc, filter) => Object.keys(filter).every((k) => {
    const want = filter[k];
    if (want == null) return doc[k] == null;
    if (typeof want === "object" && "$regex" in want) return new RegExp(want.$regex).test(String(doc[k] ?? ""));
    return String(doc[k]) === String(want);
  });
  return {
    collections: { active: "Users" },
    async get(filter = {}, room = "active") {
      const result = rooms[room].filter((d) => matches(d, filter)).map((d) => structuredClone(d));
      return { success: true, count: result.length, result };
    },
    async update(filter, data, room = "active") {
      const hit = rooms[room].find((d) => matches(d, filter));
      if (hit) Object.assign(hit, structuredClone(data));
      return { success: true, result: hit ? structuredClone(hit) : null };
    },
    async updateExisting(filter, data, room = "active") { return this.update(filter, data, room); },
    async create(data, room = "active") {
      const doc = { _id: `new-${data.tz}`, ...structuredClone(data) };
      rooms[room].push(doc);
      return { success: true, result: structuredClone(doc) };
    },
    async delete(filter, room = "active") {
      const before = rooms[room].length;
      rooms[room] = rooms[room].filter((d) => !matches(d, filter));
      return { success: true, result: { deletedCount: before - rooms[room].length } };
    },
    async dropRefreshHash(tz, hash) {
      const hit = rooms.active.find((d) => d.tz === tz);
      if (hit) {
        hit.refreshHashes = (hit.refreshHashes || []).filter((h) => h !== hash);
        hit.deviceTokens = (hit.deviceTokens || []).filter((d) => d.hash !== hash);
      }
      return { success: true };
    },
    find: (tz, room = "active") => rooms[room].find((d) => d.tz === tz),
    rooms,
  };
}

// Emails the user controller sent (new accounts).
const sentMail = [];

function loadUserController(users, audit) {
  const dependencies = {
    bcryptjs: {},
    jsonwebtoken: {},
    path,
    "./User.model": { UserModelDef: users },
    "../../utils/otp": require("../utils/otp"),
    "../../utils/sendEmail": { sendSystemAdminEmail: async () => {}, sendAccountEmail: async (to, mail) => { sentMail.push({ to, ...mail }); } },
    "../../utils/jwt": {},
    "../../utils/textEncoding": require("../utils/textEncoding"),
    "../../utils/permissions": require("../utils/permissions"),
    "../../utils/permissionRules": require("../utils/permissionRules"),
    "../../utils/israeliId": require("../utils/israeliId"),
    "../../utils/tourState": require("../utils/tourState"),
    "../../utils/loginLockout": require("../utils/loginLockout"),
    "../../utils/systemPassword": require("../utils/systemPassword"),
    "../../middleware/logger": { logWithSource() {} },
    "./passwordCrypto": {},
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
    process: { env: { SYSTEM_ADMIN_TZ: SYSTEM_TZ } },
    require(name) {
      if (!Object.hasOwn(dependencies, name) && Object.hasOwn(live.deps, name)) return live.deps[name];
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return module.exports;
}

const seed = () => ({ active: [SYS, IT_A, IT_B, IT_C, GUIDE, NO_MAIL, EMPTY_MAIL, ADMIN], waiting: [WAITING] });

async function startApp() {
  const savedTz = process.env.SYSTEM_ADMIN_TZ;
  process.env.SYSTEM_ADMIN_TZ = SYSTEM_TZ;
  const users = createUsers(seed());
  const audit = auditStub();
  const auditRows = [];
  const released = [];
  const pushState = { enabled: false, keysFrom: null };
  const driveState = createDriveConnectState();
  const deps = {
    requireIt: createRequireIt({ users, systemTz: () => SYSTEM_TZ, log: () => {} }),
    users: loadUserController(users, audit),
    members: createItMembers({ users, audit: audit.deps["../../utils/audit"].audit, systemTz: () => SYSTEM_TZ, notify: () => {} }),
    lockedUser: (req, res, next) => next(),
    auth: createItAuth({ users, audit: audit.deps["../../utils/audit"].audit, encryptPassword: (plain) => `enc:${plain}`, log: () => {} }),
    roleDefaults: createRoleDefaults({
      model: { readAll: async () => [], write: async () => {}, remove: async () => {} },
      users: async () => users.rooms.active,
      audit: audit.deps["../../utils/audit"].audit,
    }),
    auditModel: { async page(filter, { page, pageSize }) { auditRows.push({ filter, page, pageSize }); return { items: [{ action: "x" }], total: 1 }; } },
    drive: {
      getAuthUrl: (stateToken) => `https://accounts.example.test/auth?state=${stateToken}`,
      getStatus: async () => ({ connected: true, email: "org@example.test" }),
      handleOAuthCallback: async () => ({ email: "org@example.test" }),
    },
    driveState,
    locks: { async forceRelease(key) { released.push(key); return true; } },
    push: {
      async status() { return { ...pushState }; },
      async setEnabled(enabled) { pushState.enabled = enabled; pushState.keysFrom = "server"; return { ...pushState }; },
    },
  };
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/it", createItRouter(deps));
  // Google's redirect stays on the everyday mount, sharing the state store.
  app.use("/api/storage/google", createGoogleDriveRouter({ drive: deps.drive, state: driveState, audit: audit.deps["../../utils/audit"].audit, withConnect: false }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  // iat a minute back, so a membership change in this same second still counts.
  const cookieFor = (tz) => `${IT_COOKIE}=${jwt.sign({ sub: tz, typ: "it", iat: Math.floor(Date.now() / 1000) - 60 }, SECRET, { algorithm: "HS256" })}`;
  const call = (method, url, { as, body, host = IT_HOST, prefix = "/api/it" } = {}) => new Promise((resolve, reject) => {
    const headers = { Host: host, "Content-Type": "application/json" };
    if (as) headers.Cookie = cookieFor(as);
    const req = http.request({ port, path: `${prefix}${url}`, method, headers, agent: false }, (r) => {
      let text = "";
      r.on("data", (c) => { text += c; });
      r.on("end", () => {
        let parsed = text;
        try { parsed = JSON.parse(text); } catch { /* not JSON */ }
        resolve({ status: r.statusCode, body: parsed, location: r.headers.location, setCookie: r.headers["set-cookie"] || [] });
      });
    });
    req.on("error", reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  const close = () => {
    server.close();
    if (savedTz === undefined) delete process.env.SYSTEM_ADMIN_TZ; else process.env.SYSTEM_ADMIN_TZ = savedTz;
  };
  return { call, close, users, audit, auditRows, released, pushState, driveState };
}

const withApp = (fn) => async () => {
  const app = await startApp();
  try { await fn(app); } finally { app.close(); }
};

test("every IT route needs the IT session, and only IT_HOST serves them", withApp(async ({ call }) => {
  for (const [method, url] of [
    ["GET", "/users"], ["GET", `/users/${GUIDE.tz}`], ["PUT", `/users/${GUIDE.tz}/role`], ["GET", `/users/${GUIDE.tz}/permissions`],
    ["PUT", `/users/${GUIDE.tz}/password`], ["GET", `/users/${GUIDE.tz}/password`], ["POST", `/users/${GUIDE.tz}/unlock`],
    ["GET", `/users/${GUIDE.tz}/sessions`], ["DELETE", `/users/${GUIDE.tz}/sessions/sid-1`], ["GET", "/audit"],
    ["GET", "/storage/google/status"], ["POST", "/storage/google/connect-url"], ["POST", "/locks/force-release"],
    ["GET", "/push/settings"], ["PUT", "/push/settings"], ["GET", "/members"], ["POST", `/members/${GUIDE.tz}`],
    ["POST", `/users/${GUIDE.tz}/room`], ["DELETE", `/users/${GUIDE.tz}?from=active`],
    ["POST", "/members"],
    ["GET", "/role-defaults"], ["PUT", `/role-defaults/${encodeURIComponent("مرشد")}`], ["DELETE", `/role-defaults/${encodeURIComponent("مرشد")}`],
  ]) {
    assert.equal((await call(method, url, { body: {} })).status, 401, `${method} ${url} without the IT cookie`);
    assert.equal((await call(method, url, { as: IT_A.tz, body: {}, host: "tamheed.example.test" })).status, 404, `${method} ${url} on another host`);
  }
  // An everyday user (not IT) with a well-signed IT cookie is still refused.
  assert.equal((await call("GET", "/users", { as: GUIDE.tz })).status, 401);
}));

test("users list: every room, only the listed fields, never the system account", withApp(async ({ call }) => {
  const all = await call("GET", "/users", { as: IT_A.tz });
  assert.equal(all.status, 200);
  const tzs = all.body.users.map((u) => u.tz).sort();
  assert.deepEqual(tzs, [IT_A, IT_B, IT_C, GUIDE, NO_MAIL, EMPTY_MAIL, ADMIN, WAITING].map((u) => u.tz).sort());
  for (const row of all.body.users) {
    assert.deepEqual(Object.keys(row).sort(), ["firstname", "isIT", "lastname", "lockedAt", "photo", "role", "room", "tz"]);
  }
  const guide = all.body.users.find((u) => u.tz === GUIDE.tz);
  assert.equal(guide.role, "مرشد");
  assert.equal(guide.photo, GUIDE.photo);
  assert.equal(guide.isIT, false);
  assert.ok(guide.lockedAt);
  assert.equal(all.body.users.find((u) => u.tz === IT_A.tz).isIT, true);

  const waiting = await call("GET", "/users?room=waiting", { as: IT_A.tz });
  assert.deepEqual(waiting.body.users.map((u) => [u.tz, u.room]), [[WAITING.tz, "waiting"]]);
  assert.equal((await call("GET", "/users?room=elsewhere", { as: IT_A.tz })).status, 400);
}));

test("user page: an IT user reads any user, without secrets", withApp(async ({ call }) => {
  const one = await call("GET", `/users/${GUIDE.tz}`, { as: IT_A.tz });
  assert.equal(one.status, 200);
  assert.equal(one.body.user.tz, GUIDE.tz);
  for (const secret of ["password", "refreshHashes", "deviceTokens", "resetOtpHash"]) assert.equal(one.body.user[secret], undefined, secret);
  assert.equal((await call("GET", `/users/${IT_B.tz}`, { as: IT_A.tz })).status, 200, "reading another IT user is allowed");
  assert.equal((await call("GET", `/users/${SYSTEM_TZ}`, { as: IT_A.tz })).status, 404, "the system account is hidden");
}));

test("role: IT changes an everyday user's role and gives himself one; 403 on another IT user", withApp(async ({ call, users }) => {
  const changed = await call("PUT", `/users/${GUIDE.tz}/role`, { as: IT_A.tz, body: { role: "ادارة" } });
  assert.equal(changed.status, 200);
  assert.equal(users.find(GUIDE.tz).role, "ادارة");
  assert.equal((await call("PUT", `/users/${IT_A.tz}/role`, { as: IT_A.tz, body: { role: "ادارة" } })).status, 200, "his own everyday role");
  assert.equal((await call("PUT", `/users/${IT_B.tz}/role`, { as: IT_A.tz, body: { role: "ادارة" } })).status, 403);
  assert.equal(users.find(IT_B.tz).role, "مساعد");
  assert.equal((await call("PUT", `/users/${IT_B.tz}/role`, { as: SYSTEM_TZ, body: { role: "مرشد" } })).status, 200, "the system account may");
}));

test("permissions: IT reads and edits an everyday user's; 403 on another IT user; never an IT key", withApp(async ({ call, users }) => {
  const read = await call("GET", `/users/${GUIDE.tz}/permissions`, { as: IT_A.tz });
  assert.equal(read.status, 200);
  assert.ok(read.body.grantable.includes("vehicles.view"));
  assert.ok(!read.body.grantable.includes("audit.view"));
  const put = await call("PUT", `/users/${GUIDE.tz}/permissions`, { as: IT_A.tz, body: { grants: ["vehicles.view"], revokes: [] } });
  assert.equal(put.status, 200);
  assert.deepEqual(users.find(GUIDE.tz).permissionGrants, ["vehicles.view"]);
  assert.equal((await call("PUT", `/users/${GUIDE.tz}/permissions`, { as: IT_A.tz, body: { grants: ["audit.view"] } })).status, 400);
  assert.equal((await call("PUT", `/users/${IT_B.tz}/permissions`, { as: IT_A.tz, body: { grants: ["vehicles.view"] } })).status, 403);
  assert.equal((await call("GET", `/users/${IT_B.tz}/permissions`, { as: IT_A.tz })).body.grantable.length, 0);
  assert.equal((await call("PUT", `/users/${IT_B.tz}/permissions`, { as: SYSTEM_TZ, body: { grants: ["vehicles.view"] } })).status, 200);
}));

test("password: IT resets (ending the user's sessions) and views; 403 on another IT user", withApp(async ({ call, users, audit }) => {
  const before = Date.now();
  const reset = await call("PUT", `/users/${GUIDE.tz}/password`, { as: IT_A.tz, body: { password: "new-placeholder-1" } });
  assert.equal(reset.status, 200);
  const stored = users.find(GUIDE.tz);
  assert.equal(stored.password, "new-placeholder-1");
  assert.ok(new Date(stored.passwordChangedAt).getTime() >= before, "older sessions are stale");
  const row = audit.calls.find((c) => c.targetId === GUIDE.tz && c.module === "users");
  assert.ok(row, "the reset is audited");
  // The stored row keeps the password field, never its value (utils/audit diffChanges).
  assert.deepEqual(require("../utils/audit").diffChanges(row.before, row.after).password, { before: "***", after: "***" });
  assert.equal((await call("PUT", `/users/${GUIDE.tz}/password`, { as: IT_A.tz, body: { password: "x".repeat(129) } })).status, 400);
  assert.equal((await call("PUT", `/users/${GUIDE.tz}/password`, { as: IT_A.tz, body: {} })).status, 400);

  const view = await call("GET", `/users/${GUIDE.tz}/password`, { as: IT_A.tz });
  assert.equal(view.status, 200);
  assert.equal(view.body.hasPassword, true);

  assert.equal((await call("PUT", `/users/${IT_B.tz}/password`, { as: IT_A.tz, body: { password: "new-placeholder-2" } })).status, 403);
  assert.equal(users.find(IT_B.tz).password, "it-b-placeholder");
  assert.equal((await call("GET", `/users/${IT_B.tz}/password`, { as: IT_A.tz })).status, 403);
  assert.equal((await call("PUT", `/users/${IT_B.tz}/password`, { as: SYSTEM_TZ, body: { password: "new-placeholder-2" } })).status, 200);
}));

test("unlock: IT unlocks an everyday user; 403 on another IT user", withApp(async ({ call, users }) => {
  assert.equal((await call("POST", `/users/${GUIDE.tz}/unlock`, { as: IT_A.tz })).status, 200);
  assert.equal(users.find(GUIDE.tz).lockedAt, null);
  assert.equal(users.find(GUIDE.tz).failedLoginCount, 0);
  assert.equal((await call("POST", `/users/${IT_C.tz}/unlock`, { as: IT_A.tz })).status, 403);
  assert.ok(users.find(IT_C.tz).lockedAt);
  assert.equal((await call("POST", `/users/${IT_C.tz}/unlock`, { as: SYSTEM_TZ })).status, 200);
  assert.equal(users.find(IT_C.tz).lockedAt, null);
}));

test("sessions: IT lists a user's devices and signs one out; 403 on another IT user", withApp(async ({ call, users, audit }) => {
  const list = await call("GET", `/users/${GUIDE.tz}/sessions`, { as: IT_A.tz });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.devices.map((d) => d.sid).sort(), ["sid-1", "sid-2"]);
  assert.ok(list.body.devices.every((d) => d.hash === undefined), "never the refresh hash");
  assert.equal((await call("DELETE", `/users/${GUIDE.tz}/sessions/sid-1`, { as: IT_A.tz })).status, 200);
  assert.deepEqual(users.find(GUIDE.tz).refreshHashes, ["h2"]);
  assert.ok(audit.calls.some((c) => c.action === "sign_out_device" && c.targetId === GUIDE.tz));
  assert.equal((await call("DELETE", `/users/${GUIDE.tz}/sessions/sid-9`, { as: IT_A.tz })).status, 404);
  assert.equal((await call("GET", `/users/${IT_B.tz}/sessions`, { as: IT_A.tz })).status, 403);
  assert.equal((await call("DELETE", `/users/${IT_B.tz}/sessions/sid-1`, { as: IT_A.tz })).status, 403);
}));

test("system recover: IT may ask, at most three times an hour", withApp(async ({ call }) => {
  // The system account has no failed sign-ins, so recovery is not allowed (409).
  for (let i = 0; i < 3; i += 1) assert.equal((await call("POST", "/system/recover", { as: IT_A.tz })).status, 409);
  assert.equal((await call("POST", "/system/recover", { as: IT_A.tz })).status, 429);
  const source = fs.readFileSync(path.join(__dirname, "../Entities/It/It.route.js"), "utf8");
  // The session and permission checks run first: others never use up the budget.
  assert.match(source, /router\.post\("\/system\/recover",\s*requireIt,\s*requirePermission\("systemRecovery\.reset"\),\s*recoverRateLimit,\s*users\.recoverSystem\)/);
  assert.match(source, /recoverRateLimit = rateLimit\(\{ windowMs: 60 \* 60 \* 1000, max: 3, scope: "system-recover" \}\)/);
}));

test("audit: the IT site reads today's audit query", withApp(async ({ call, auditRows }) => {
  const page = await call("GET", "/audit?module=users&page=2", { as: IT_A.tz });
  assert.equal(page.status, 200);
  assert.deepEqual(page.body, { ok: true, items: [{ action: "x" }], total: 1 });
  assert.deepEqual(auditRows[0], { filter: { module: "users" }, page: 2, pageSize: 50 });
}));

test("storage: IT gets the Drive status and a connect URL; Google's callback stays on the everyday mount", withApp(async ({ call, audit }) => {
  const status = await call("GET", "/storage/google/status", { as: IT_A.tz });
  assert.equal(status.status, 200);
  assert.equal(status.body.canConnect, true);
  const url = await call("POST", "/storage/google/connect-url", { as: IT_A.tz });
  assert.equal(url.status, 200);
  const token = new URL(url.body.url).searchParams.get("state");
  assert.equal((await call("GET", `/storage/google/callback?state=${token}&code=y`, { as: IT_A.tz })).status, 404, "no callback on /api/it");
  // Google sends the browser back to the everyday host; it lands on the IT site's storage screen.
  const back = await call("GET", `/callback?state=${token}&code=y`, { host: "tamheed.example.test", prefix: "/api/storage/google" });
  assert.equal(back.status, 302);
  assert.equal(back.location, "https://it.example.test/storage?drive=connected");
  const row = audit.find({ action: "drive_connect" })[0];
  assert.equal(row.req.actor.tz, IT_A.tz, "recorded under the IT user who asked");
  assert.equal(row.req.actor.site, undefined);
  const again = await call("GET", `/callback?state=${token}&code=y`, { host: "tamheed.example.test", prefix: "/api/storage/google" });
  assert.equal(again.location, "/files?drive=denied", "a state works once");
}));

test("settings: IT force-releases a lock and switches push notifications", withApp(async ({ call, released, pushState }) => {
  const freed = await call("POST", "/locks/force-release", { as: IT_A.tz, body: { key: "student:5" } });
  assert.equal(freed.status, 200);
  assert.deepEqual(released, ["student:5"]);
  assert.equal((await call("POST", "/locks/force-release", { as: IT_A.tz, body: { key: "bad key" } })).status, 400);
  assert.deepEqual((await call("GET", "/push/settings", { as: IT_A.tz })).body, { ok: true, enabled: false, keysFrom: null });
  const on = await call("PUT", "/push/settings", { as: IT_A.tz, body: { enabled: true } });
  assert.equal(on.status, 200);
  assert.equal(pushState.enabled, true);
  assert.equal((await call("PUT", "/push/settings", { as: IT_A.tz, body: { enabled: "yes" } })).status, 400);
}));

test("members routes are 403 for an IT user who is not the system account", withApp(async ({ call, users }) => {
  for (const [method, url] of [["GET", "/members"], ["POST", `/members/${GUIDE.tz}`], ["DELETE", `/members/${IT_B.tz}`],
    ["POST", `/members/${IT_B.tz}/block`], ["POST", `/members/${IT_B.tz}/unblock`]]) {
    assert.equal((await call(method, url, { as: IT_A.tz })).status, 403, `${method} ${url}`);
  }
  assert.equal(users.find(GUIDE.tz).isIT, undefined);
  assert.equal(users.find(IT_B.tz).isIT, true);
}));

test("the system account lists, adds, blocks, unblocks and removes IT users, each audited under it", withApp(async ({ call, users, audit }) => {
  const list = await call("GET", "/members", { as: SYSTEM_TZ });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.members.map((m) => m.tz).sort(), [IT_A.tz, IT_B.tz, IT_C.tz].sort());
  for (const row of list.body.members) {
    assert.deepEqual(Object.keys(row).sort(), ["firstname", "itBlockedAt", "itManager", "itSince", "lastname", "photo", "role", "tz"]);
  }

  const before = Date.now();
  const added = await call("POST", `/members/${GUIDE.tz}`, { as: SYSTEM_TZ });
  assert.equal(added.status, 200);
  const guide = users.find(GUIDE.tz);
  assert.equal(guide.isIT, true);
  assert.equal(guide.itBlockedAt, null);
  assert.ok(new Date(guide.itSince).getTime() >= before);
  assert.equal((await call("POST", `/members/${GUIDE.tz}`, { as: SYSTEM_TZ })).status, 409, "already IT");
  assert.equal((await call("POST", `/members/${WAITING.tz}`, { as: SYSTEM_TZ })).status, 404, "only active users");

  assert.equal((await call("POST", `/members/${GUIDE.tz}/block`, { as: SYSTEM_TZ })).status, 200);
  assert.ok(users.find(GUIDE.tz).itBlockedAt);
  assert.equal((await call("POST", `/members/${GUIDE.tz}/unblock`, { as: SYSTEM_TZ })).status, 200);
  assert.equal(users.find(GUIDE.tz).itBlockedAt, null);
  assert.equal((await call("DELETE", `/members/${GUIDE.tz}`, { as: SYSTEM_TZ })).status, 200);
  assert.equal(users.find(GUIDE.tz).isIT, false);
  assert.equal(users.find(GUIDE.tz).role, "مرشد", "the everyday account is unchanged");
  assert.equal((await call("DELETE", `/members/${GUIDE.tz}`, { as: SYSTEM_TZ })).status, 409, "not IT any more");
  assert.equal((await call("POST", `/members/${ADMIN.tz}/block`, { as: SYSTEM_TZ })).status, 409, "only an IT user is blocked");

  const rows = audit.calls.filter((c) => c.module === "it" && c.targetId === GUIDE.tz).map((c) => c.action);
  assert.deepEqual(rows, ["member_add", "member_block", "member_unblock", "member_remove"]);
  assert.ok(audit.calls.filter((c) => c.module === "it").every((c) => c.req.actor.isSystem === true));
}));

test("cannot make IT a user without a real email", withApp(async ({ call, users, audit }) => {
  for (const user of [NO_MAIL, EMPTY_MAIL]) {
    const refused = await call("POST", `/members/${user.tz}`, { as: SYSTEM_TZ });
    assert.equal(refused.status, 400);
    assert.equal(refused.body.code, "NO_REAL_EMAIL");
    assert.ok(refused.body.message);
    assert.notEqual(users.find(user.tz).isIT, true);
  }
  assert.equal(audit.calls.filter((c) => c.module === "it").length, 0);
}));

test("the system account cannot be removed or blocked", withApp(async ({ call, users }) => {
  for (const [method, url] of [["DELETE", `/members/${SYSTEM_TZ}`], ["POST", `/members/${SYSTEM_TZ}/block`], ["POST", `/members/${SYSTEM_TZ}`]]) {
    const refused = await call(method, url, { as: SYSTEM_TZ });
    assert.equal(refused.status, 403, `${method} ${url}`);
    assert.equal(refused.body.code, "SYSTEM_ACCOUNT");
  }
  const sys = users.find(SYSTEM_TZ);
  assert.equal(sys.isIT, true);
  assert.equal(sys.itBlockedAt, undefined);
  assert.equal((await call("GET", "/me", { as: SYSTEM_TZ })).status, 200);
}));

test("a removed or blocked IT user is signed out at once; unblocking does not revive the old session", withApp(async ({ call }) => {
  assert.equal((await call("GET", "/me", { as: IT_A.tz })).status, 200);
  await call("POST", `/members/${IT_A.tz}/block`, { as: SYSTEM_TZ });
  assert.equal((await call("GET", "/me", { as: IT_A.tz })).status, 401);
  await call("POST", `/members/${IT_A.tz}/unblock`, { as: SYSTEM_TZ });
  assert.equal((await call("GET", "/me", { as: IT_A.tz })).status, 401, "a session from before the block stays ended");

  assert.equal((await call("GET", "/me", { as: IT_B.tz })).status, 200);
  await call("DELETE", `/members/${IT_B.tz}`, { as: SYSTEM_TZ });
  assert.equal((await call("GET", "/me", { as: IT_B.tz })).status, 401);
}));

const routesOf = (router) => (router.stack || [])
  .filter((layer) => layer.route)
  .flatMap((layer) => Object.keys(layer.route.methods).map((m) => `${m.toUpperCase()} ${layer.route.path}`));

test("the everyday API no longer serves audit, Drive connect, force-release or push settings", () => {
  const serverSource = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  assert.ok(!/['"]\/api\/audit['"]/.test(serverSource), "no /api/audit mount");
  const auditRoute = require("../Entities/Audit/Audit.route");
  assert.equal(typeof auditRoute, "object", "Audit.route.js exports its factory only, no router");
  assert.equal(typeof auditRoute.createAuditRouter, "function");

  const drive = routesOf(require("../Entities/Storage/GoogleDrive.route"));
  assert.deepEqual(drive, ["GET /callback"], "only Google's redirect stays on /api/storage/google");
  const lock = routesOf(require("../Entities/Lock/Lock.route"));
  assert.ok(lock.includes("POST /acquire"));
  assert.ok(!lock.includes("POST /force-release"));
  const push = routesOf(require("../Entities/Push/Push.route"));
  assert.ok(push.includes("POST /subscribe"));
  assert.ok(!push.some((r) => r.endsWith(" /settings")));
});

test("role defaults: an IT user reads and changes a role's defaults; the role's users get them", withApp(async ({ call }) => {
  try {
    const list = await call("GET", "/role-defaults", { as: IT_A.tz });
    assert.equal(list.status, 200);
    assert.equal(list.body.roles.length, 3);
    const saved = await call("PUT", `/role-defaults/${encodeURIComponent("مرشد")}`, { as: IT_A.tz, body: { keys: ["students"] } });
    assert.equal(saved.status, 200);
    assert.ok(saved.body.role.defaults.includes("students.edit"));
    const guide = await call("GET", `/users/${GUIDE.tz}/permissions`, { as: IT_A.tz });
    assert.ok(guide.body.defaults.includes("students.edit"));
    assert.ok(!guide.body.defaults.includes("ai.use"));
    const refused = await call("PUT", `/role-defaults/${encodeURIComponent("مرشد")}`, { as: IT_A.tz, body: { keys: ["audit.view"] } });
    assert.equal(refused.status, 400);
  } finally {
    setRoleDefaultsOverride("مرشد", null);
  }
}));

test("account state: IT disables and re-enables an everyday user, and deletes one; 403 on another IT user", withApp(async ({ call, users }) => {
  const off = await call("POST", `/users/${ADMIN.tz}/room`, { as: IT_A.tz, body: { from: "active", to: "noActive" } });
  assert.equal(off.status, 200);
  assert.ok(users.find(ADMIN.tz, "noActive"));
  assert.equal(users.find(ADMIN.tz, "active"), undefined);
  const on = await call("POST", `/users/${ADMIN.tz}/room`, { as: IT_A.tz, body: { from: "noActive", to: "active" } });
  assert.equal(on.status, 200);
  assert.ok(users.find(ADMIN.tz, "active"));

  const gone = await call("DELETE", `/users/${NO_MAIL.tz}?from=active`, { as: IT_A.tz });
  assert.equal(gone.status, 200);
  assert.equal(users.find(NO_MAIL.tz, "active"), undefined);

  assert.equal((await call("POST", `/users/${IT_B.tz}/room`, { as: IT_A.tz, body: { from: "active", to: "noActive" } })).status, 403);
  assert.equal((await call("DELETE", `/users/${IT_B.tz}?from=active`, { as: IT_A.tz })).status, 403);
  assert.ok(users.find(IT_B.tz, "active"));
}));

test("blocking or removing an IT user deletes his IT passkeys, and none leaves the server", withApp(async ({ call, users }) => {
  const key = { id: "cred-x", publicKey: "AQID", counter: 0, transports: [] };
  users.find(IT_A.tz).itPasskeys = [key];
  users.find(IT_B.tz).itPasskeys = [key];
  const page = await call("GET", `/users/${IT_B.tz}`, { as: SYSTEM_TZ });
  assert.equal(JSON.stringify(page.body).includes("itPasskeys"), false);
  assert.equal((await call("POST", `/members/${IT_A.tz}/block`, { as: SYSTEM_TZ })).status, 200);
  assert.deepEqual(users.find(IT_A.tz).itPasskeys, []);
  assert.equal((await call("DELETE", `/members/${IT_B.tz}`, { as: SYSTEM_TZ })).status, 200);
  assert.deepEqual(users.find(IT_B.tz).itPasskeys, []);
}));

test("passkey sign-in routes are open, saving one needs the IT session", withApp(async ({ call }) => {
  assert.equal((await call("POST", "/passkey/register-options", { body: {} })).status, 401);
  assert.equal((await call("POST", "/passkey/register", { body: {} })).status, 401);
  assert.equal((await call("POST", "/passkey/login-options", { body: {}, host: "tamheed.example.test" })).status, 404);
}));

test("any IT user creates a brand-new IT user; a temporary password goes to his email only", withApp(async ({ call, users, audit }) => {
  sentMail.length = 0;
  const body = { tz: "600000004", firstname: "New", lastname: "Person", email: "new.person@example.test", phone: "0500000000", role: "مرشد" };
  const made = await call("POST", "/members", { as: IT_A.tz, body });
  assert.equal(made.status, 201);
  assert.equal(JSON.stringify(made.body).includes("password"), false);
  const stored = users.find("600000004", "active");
  assert.ok(stored);
  assert.equal(stored.isIT, true);
  assert.equal(stored.role, "مرشد");
  assert.ok(stored.itSince);
  assert.equal(stored.itBlockedAt, null);
  assert.match(stored.password, /^[0-9]{8}$/, "an 8-digit first password");
  assert.equal(stored.mustChangePassword, true);
  assert.equal(sentMail.length, 1);
  assert.equal(sentMail[0].to, "new.person@example.test");
  assert.ok(sentMail[0].text.includes(stored.password));
  assert.equal(audit.find({ action: "create", targetId: "600000004" }).length, 1);

  // The new IT user is now out of the creator's reach, like every IT user.
  assert.equal((await call("PUT", `/users/600000004/role`, { as: IT_A.tz, body: { role: "ادارة" } })).status, 403);

  // No role at all is fine.
  assert.equal((await call("POST", "/members", { as: IT_A.tz, body: { ...body, tz: "600000012", role: "" } })).status, 201);
  assert.equal(users.find("600000012", "active").role, null);
}));

test("creating an IT user: a taken or invalid ID number, a fake email, a missing name or an unknown role are refused", withApp(async ({ call, users }) => {
  const body = { tz: "600000020", firstname: "New", lastname: "Person", email: "new.person@example.test" };
  const code = async (b) => (await call("POST", "/members", { as: IT_A.tz, body: { ...body, ...b } })).body.code;
  assert.equal(await code({ tz: GUIDE.tz }), "TZ_EXISTS");
  users.rooms.waiting.push({ tz: "600000038", firstname: "Wa", lastname: "It" });
  assert.equal(await code({ tz: "600000038" }), "TZ_EXISTS", "waiting room too");
  assert.equal(await code({ tz: "123" }), "INVALID_TZ");
  assert.equal(await code({ tz: SYSTEM_TZ }), "INVALID_TZ");
  assert.equal(await code({ email: "test@test.com" }), "NO_REAL_EMAIL");
  assert.equal(await code({ email: "" }), "NO_REAL_EMAIL");
  assert.equal(await code({ firstname: " " }), "NAME_REQUIRED");
  assert.equal(await code({ role: "مدير" }), "UNKNOWN_ROLE");
  assert.equal(users.find("600000020", "active"), undefined);
}));

test("a temporary password: only /me and the change work until it is changed; then the session goes on", withApp(async ({ call, users, audit }) => {
  users.find(IT_B.tz).mustChangePassword = true;
  const me = await call("GET", "/me", { as: IT_B.tz });
  assert.equal(me.status, 200);
  assert.equal(me.body.mustChangePassword, true);
  const blocked = await call("GET", "/users", { as: IT_B.tz });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, "PASSWORD_CHANGE_REQUIRED");
  assert.equal((await call("GET", "/role-defaults", { as: IT_B.tz })).status, 403);
  assert.equal((await call("GET", "/audit", { as: IT_B.tz })).status, 403);

  assert.equal((await call("POST", "/change-password", { as: IT_B.tz, body: { newPassword: "" } })).body.code, "PASSWORD_REQUIRED");
  const changed = await call("POST", "/change-password", { as: IT_B.tz, body: { newPassword: "a-new-long-placeholder" } });
  assert.equal(changed.status, 200);
  const after = users.find(IT_B.tz);
  assert.equal(after.mustChangePassword, false);
  assert.ok(after.passwordChangedAt);
  assert.notEqual(after.password, "a-new-long-placeholder", "stored encrypted");
  assert.equal(audit.find({ action: "password_change", targetId: IT_B.tz }).length, 1);
  // The answer carries a new IT cookie; one signed before the change is refused.
  assert.equal(changed.setCookie.some((c) => c.startsWith(`${IT_COOKIE}=`)), true);
  assert.equal((await call("GET", "/users", { as: IT_B.tz })).status, 401);

  // Without a temporary password there is nothing to change here.
  assert.equal((await call("POST", "/change-password", { as: IT_A.tz, body: { newPassword: "a-new-long-placeholder" } })).status, 403);
}));

test("an IT user reads and changes his own everyday permissions on the IT site, never an IT key", withApp(async ({ call, users }) => {
  const mine = await call("GET", `/users/${IT_A.tz}/permissions`, { as: IT_A.tz });
  assert.equal(mine.status, 200);
  assert.ok(mine.body.grantable.length > 0, "editable");
  const saved = await call("PUT", `/users/${IT_A.tz}/permissions`, { as: IT_A.tz, body: { grants: ["vehicles.view"], revokes: [] } });
  assert.equal(saved.status, 200);
  assert.deepEqual(users.find(IT_A.tz).permissionGrants, ["vehicles.view"]);
  const itKey = await call("PUT", `/users/${IT_A.tz}/permissions`, { as: IT_A.tz, body: { grants: ["users.passwords"], revokes: [] } });
  assert.equal(itKey.status, 400);
  // Another IT user's: still out of reach.
  assert.equal((await call("PUT", `/users/${IT_B.tz}/permissions`, { as: IT_A.tz, body: { grants: ["vehicles.view"], revokes: [] } })).status, 403);
}));

test("an «مدير IT» (given only by the system account) manages IT users, never another manager, himself or the system account", withApp(async ({ call, users, audit }) => {
  // Only the system account makes or unmakes a manager.
  assert.equal((await call("POST", `/members/${IT_A.tz}/manager`, { as: IT_B.tz, body: { manager: true } })).status, 403);
  const made = await call("POST", `/members/${IT_A.tz}/manager`, { as: SYSTEM_TZ, body: { manager: true } });
  assert.equal(made.status, 200);
  assert.equal(users.find(IT_A.tz).itManager, true);
  assert.equal(audit.find({ action: "member_manager_on", targetId: IT_A.tz }).length, 1);
  assert.equal((await call("GET", "/me", { as: IT_A.tz })).body.isItManager, true);
  assert.equal((await call("GET", "/me", { as: IT_B.tz })).body.isItManager, false);

  // The manager lists, blocks, unblocks, removes and adds.
  assert.equal((await call("GET", "/members", { as: IT_A.tz })).status, 200);
  assert.equal((await call("POST", `/members/${IT_B.tz}/block`, { as: IT_A.tz })).status, 200);
  assert.equal((await call("POST", `/members/${IT_B.tz}/unblock`, { as: IT_A.tz })).status, 200);
  assert.equal((await call("DELETE", `/members/${IT_B.tz}`, { as: IT_A.tz })).status, 200);
  assert.equal(users.find(IT_B.tz).isIT, false, "a regular user now");
  assert.equal((await call("POST", `/members/${IT_B.tz}`, { as: IT_A.tz })).status, 200);
  assert.equal(users.find(IT_B.tz).isIT, true);

  // Never another manager, himself, or the system account; never makes a manager.
  users.find(IT_B.tz).itManager = true;
  assert.equal((await call("DELETE", `/members/${IT_B.tz}`, { as: IT_A.tz })).status, 403);
  assert.equal((await call("POST", `/members/${IT_B.tz}/block`, { as: IT_A.tz })).status, 403);
  assert.equal((await call("DELETE", `/members/${IT_A.tz}`, { as: IT_A.tz })).status, 403);
  assert.equal((await call("DELETE", `/members/${SYSTEM_TZ}`, { as: IT_A.tz })).status, 403);
  assert.equal((await call("POST", `/members/${IT_C.tz}/manager`, { as: IT_A.tz, body: { manager: true } })).status, 403);

  // The system account removes a manager: out of IT and no longer a manager.
  assert.equal((await call("DELETE", `/members/${IT_B.tz}`, { as: SYSTEM_TZ })).status, 200);
  assert.equal(users.find(IT_B.tz).itManager, false);
  // A plain IT user still has no members screen.
  users.find(IT_A.tz).itManager = false;
  assert.equal((await call("GET", "/members", { as: IT_A.tz })).status, 403);
}));
