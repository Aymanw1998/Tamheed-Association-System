const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const bcrypt = require("bcryptjs");
const express = require("express");

const FAKE_HASH = bcrypt.hashSync("real-pass", 4);

// Load the real controller with inert dependencies (same approach as
// user-profile-authorization.test.js).
function loadController(storedPassword = FAKE_HASH) {
  const user = { _id: "id-1", tz: "1", roles: [], password: storedPassword };
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
  };
  const filename = path.join(__dirname, "../Entities/User/User.controller.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    process: { env: process.env },
    require(name) {
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
    },
  };
  delete require.cache[routePath];
  const router = require("../Entities/User/User.route");
  delete require.cache[routePath];
  delete require.cache[controllerPath];
  auth.requireAuth = originalRequireAuth;

  const app = express();
  app.use("/user", router);
  const server = http.createServer(app);
  return new Promise((resolve) =>
    server.listen(0, () => resolve({ server, hits, base: `http://127.0.0.1:${server.address().port}/user` }))
  );
}

test("photo upload for another user needs admin", async () => {
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

test("photo delete for another user needs admin", async () => {
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
