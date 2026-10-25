const assert = require("node:assert/strict");
const live = require("./helpers/liveStubs");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { auditStub } = require("./helpers/auditStub");
const bcrypt = require("bcryptjs");
const express = require("express");

const FAKE_HASH = bcrypt.hashSync("real-pass", 4);

// Load the real controller with inert dependencies (same approach as
// user-profile-authorization.test.js).
function loadController(storedPassword = FAKE_HASH, extra = {}) {
  const user = { _id: "id-1", tz: "1", roles: [], password: storedPassword, ...extra };
  const dependencies = {
    bcryptjs: bcrypt,
    jsonwebtoken: {},
    path,
    "./User.model": {
      UserModelDef: {
        async get(filter) {
          if (filter.tz === "1" || filter._id === "1") return { success: true, result: [user] };
          return { success: true, result: [] };
        },
        async update() { return { success: true }; },
      },
    },
    "../../utils/otp": require("../utils/otp"),
    "../../utils/sendEmail": {},
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
    "../../utils/permissionRules": require("../utils/permissionRules"),
    "../../utils/israeliId": require("../utils/israeliId"),
    "../../utils/tourState": require("../utils/tourState"),
    "../../utils/loginLockout": require("../utils/loginLockout"),
    "../../utils/systemPassword": require("../utils/systemPassword"),
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
    ...require("./helpers/alertEventsStub").noopAlertDeps,
    ...auditStub().deps,
  };
  const filename = path.join(__dirname, "../Entities/User/User.controller.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    process: { env: process.env },
    require(name) {
      if (!Object.hasOwn(dependencies, name) && Object.hasOwn(live.deps, name)) return live.deps[name];
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return module.exports;
}

function makeRes() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    cookie() { return this; },
  };
}

async function tryLogin(password, stored) {
  const { login } = loadController(stored);
  const res = makeRes();
  await login({ body: { tz: "1", password }, headers: {}, cookies: {} }, res);
  return res;
}

test("login rejects the Tamheed_Pass master password", async () => {
  process.env.Tamheed_Pass = "master-x";
  try {
    const res = await tryLogin("master-x");
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, "INVALID_CREDENTIALS");
  } finally {
    delete process.env.Tamheed_Pass;
  }
});

test("login rejects the stored hash sent as the password", async () => {
  const res = await tryLogin(FAKE_HASH);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "INVALID_CREDENTIALS");
});

test("login still accepts the real password", async () => {
  const res = await tryLogin("real-pass");
  assert.equal(res.statusCode, 200);
});

test("viewPassword never returns the stored value", async () => {
  for (const stored of [FAKE_HASH, "enc:secret-value", "plain-secret"]) {
    const { viewPassword } = loadController(stored);
    const res = makeRes();
    await viewPassword({ params: { tz: "1" } }, res);
    const text = JSON.stringify(res.body);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.hasPassword, true);
    assert.deepEqual(Object.keys(res.body).sort(), ["hasPassword", "ok"]);
    assert.ok(!text.includes(stored), "stored value leaked");
    assert.ok(!text.includes("secret-value"), "decrypted value leaked");
  }
});

test("viewPassword reports hasPassword false when none is stored", async () => {
  const { viewPassword } = loadController("");
  const res = makeRes();
  await viewPassword({ params: { tz: "1" } }, res);
  assert.deepEqual(JSON.parse(JSON.stringify(res.body)), { ok: true, hasPassword: false });
});

// ---- route wiring ----

function startPhotoApp(userTz) {
  const auth = require("../middleware/authMiddleware");
  const originalRequireAuth = auth.requireAuth;
  auth.requireAuth = (req, res, next) => { req.user = { id: "u", tz: userTz, roles: ["مرشد"] }; next(); };
  const pm = require("../middleware/permissionMiddleware");
  const originalLoadActor = pm.loadActor;
  pm.loadActor = require("./helpers/actors").tokenLoadActor;

  const controllerPath = require.resolve("../Entities/User/User.controller");
  const routePath = require.resolve("../Entities/User/User.route");
  const hits = [];
  const handler = (name) => (req, res) => { hits.push(name); res.json({ ok: true }); };
  const noop = () => (req, res) => res.json({});
  require.cache[controllerPath] = {
    id: controllerPath, filename: controllerPath, loaded: true,
    exports: {
      getAllU: noop(), uploadPhoto: handler("upload"), deletePhoto: handler("delete"), getOneU: noop(),
      putU: noop(), deleteU: noop(), postU: noop(), changeRoom: noop(),
      viewPassword: noop(), updateStoragePermissions: noop(),
      getPermissions: noop(), putPermissions: noop(), putRole: noop(), unlockUser: noop(), recoverSystem: noop(),
    },
  };
  // The lock guard would look the user up in the database; locks have their own tests.
  const guardPath = require.resolve("../middleware/lockGuard");
  const realGuard = require.cache[guardPath];
  require.cache[guardPath] = {
    id: guardPath, filename: guardPath, loaded: true,
    exports: { requireFreeOrMine: () => (req, res, next) => next() },
  };
  const modelPath = require.resolve("../Entities/User/User.model");
  const realModel = require.cache[modelPath];
  require.cache[modelPath] = { id: modelPath, filename: modelPath, loaded: true, exports: { UserModelDef: {} } };
  delete require.cache[routePath];
  const router = require("../Entities/User/User.route");
  delete require.cache[routePath];
  delete require.cache[controllerPath];
  if (realGuard) require.cache[guardPath] = realGuard; else delete require.cache[guardPath];
  if (realModel) require.cache[modelPath] = realModel; else delete require.cache[modelPath];
  auth.requireAuth = originalRequireAuth;
  pm.loadActor = originalLoadActor;

  const app = express();
  app.use("/user", router);
  const server = http.createServer(app);
  return new Promise((resolve) =>
    server.listen(0, () => resolve({ server, hits, base: `http://127.0.0.1:${server.address().port}/user` }))
  );
}

test("photo upload for another user needs users.edit", async () => {
  const { server, hits, base } = await startPhotoApp("1");
  try {
    const other = await fetch(`${base}/upload-photo/2`, { method: "POST" });
    assert.equal(other.status, 403);
    assert.equal((await other.json()).code, "FORBIDDEN");
    const own = await fetch(`${base}/upload-photo/1`, { method: "POST" });
    assert.equal(own.status, 200);
    assert.deepEqual(hits, ["upload"]);
  } finally {
    server.close();
  }
});

test("photo delete for another user needs users.edit", async () => {
  const { server, hits, base } = await startPhotoApp("1");
  try {
    const other = await fetch(`${base}/photo/2`, { method: "DELETE" });
    assert.equal(other.status, 403);
    assert.equal((await other.json()).code, "FORBIDDEN");
    const own = await fetch(`${base}/photo/1`, { method: "DELETE" });
    assert.equal(own.status, 200);
    assert.deepEqual(hits, ["delete"]);
  } finally {
    server.close();
  }
});

test("the password-guessing endpoint is gone", async () => {
  assert.equal(loadController().CheckPasswordisGood, undefined);
  const { server, base } = await startPhotoApp("1");
  try {
    const res = await fetch(`${base}/checkPasswordisGood`, { method: "POST" });
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

// ---- getme ----

test("getme adds the resolved role and the effective permissions", async () => {
  const { getme } = loadController(FAKE_HASH, { roles: ["مرشد"], permissionGrants: ["vehicles.view"] });
  const res = makeRes();
  await getme({ user: { tz: "1" } }, res);
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(JSON.stringify(res.body));
  assert.equal(body.ok, true);
  assert.equal(body.user.tz, "1");
  assert.equal(body.user.password, undefined);
  assert.equal(body.role, "مرشد");
  assert.ok(body.permissions.includes("students.edit"));
  assert.ok(body.permissions.includes("vehicles.view"));
  assert.ok(!body.permissions.includes("students.delete"));
  // Only the system account is flagged; nobody else carries the field.
  assert.equal(Object.hasOwn(body, "isSystem"), false);
});

test("getme gives the system account every permission", async () => {
  const saved = process.env.SYSTEM_ADMIN_TZ;
  process.env.SYSTEM_ADMIN_TZ = "1";
  try {
    const { getme } = loadController(FAKE_HASH, { role: "ادارة" });
    const res = makeRes();
    await getme({ user: { tz: "1" } }, res);
    const { ALL_KEYS } = require("../utils/permissions");
    assert.deepEqual([...res.body.permissions].sort(), [...ALL_KEYS].sort());
    assert.equal(res.body.isSystem, true);
  } finally {
    if (saved === undefined) delete process.env.SYSTEM_ADMIN_TZ; else process.env.SYSTEM_ADMIN_TZ = saved;
  }
});
