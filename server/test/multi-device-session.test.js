const assert = require("node:assert/strict");
const live = require("./helpers/liveStubs");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { auditStub } = require("./helpers/auditStub");
const bcrypt = require("bcryptjs");

// The owner's rule: one account may be signed in on several devices at once.
// Signing in on a second device, refreshing there and signing out there never
// ends the first device's session.

const HASH = bcrypt.hashSync("real-pass", 4);

function world() {
  const user = { _id: "id-1", tz: "1", roles: ["مرشد"], password: HASH, storageFolder: "f" };
  let n = 0;
  const accessClaims = [];
  const model = {
    async get(filter) {
      return { success: true, result: filter.tz === "1" || filter._id === "1" ? [{ ...user, refreshHashes: [...(user.refreshHashes || [])], deviceTokens: user.deviceTokens && [...user.deviceTokens] }] : [] };
    },
    async update(filter, patch) { Object.assign(user, patch); return { success: true, result: user }; },
    async updateExisting(filter, patch) { Object.assign(user, patch); return { success: true, result: user }; },
    async addRefreshHash(tz, hash, max, clearLegacy, device) {
      user.refreshHashes = [...(user.refreshHashes || []), hash].slice(-max);
      if (device) user.deviceTokens = [...(user.deviceTokens || []), device].slice(-max);
      if (clearLegacy) user.refreshHash = null;
    },
    async dropRefreshHash(tz, hash) {
      user.refreshHashes = (user.refreshHashes || []).filter((h) => h !== hash);
      if (user.deviceTokens) user.deviceTokens = user.deviceTokens.filter((d) => d.hash !== hash);
      if (user.refreshHash === hash) user.refreshHash = null;
    },
    async keepOnlyRefreshHash(tz, hash) {
      user.refreshHashes = [hash];
      user.deviceTokens = (user.deviceTokens || []).filter((d) => d.hash === hash);
      user.refreshHash = null;
    },
  };
  const deps = {
    bcryptjs: bcrypt,
    jsonwebtoken: { verify: (token) => ({ tz: "1", iat: Math.floor(Date.now() / 1000) + 60, token, sid: String(token).split("~")[1] || undefined }) },
    path,
    "./User.model": { UserModelDef: model },
    "../../utils/otp": require("../utils/otp"),
    "../../utils/sendEmail": {},
    "../../utils/jwt": {
      signAccessToken: (claims) => { accessClaims.push(claims); return "access"; },
      signRefreshToken: (claims) => `refresh-${(n += 1)}~${claims.sid || ""}`,
      setRefreshCookie(res, token) { res.cookieSet = token; },
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
    "../../utils/refreshSessions": require("../utils/refreshSessions"),
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
      if (!Object.hasOwn(deps, name) && Object.hasOwn(live.deps, name)) return live.deps[name];
      assert.ok(Object.hasOwn(deps, name), `Unexpected dependency: ${name}`);
      return deps[name];
    },
  }, { filename });
  return { c: module.exports, user, accessClaims };
}

const res = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(value) { this.body = value; return this; },
  cookie() { return this; },
});

async function signIn(c, userAgent = "") {
  const r = res();
  await c.login({ body: { tz: "1", password: "real-pass" }, headers: { "user-agent": userAgent }, cookies: {} }, r);
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  return r.cookieSet;
}
async function refresh(c, token) {
  const r = res();
  await c.refreshAccessToken({ cookies: { refresh: token }, headers: {} }, r);
  return r;
}

test("a second device signing in does not end the first one", async () => {
  const { c } = world();
  const phone = await signIn(c);
  const laptop = await signIn(c);
  assert.equal((await refresh(c, phone)).statusCode, 200);
  assert.equal((await refresh(c, laptop)).statusCode, 200);
});

test("after a refresh the device's old token is spent, its new one works", async () => {
  const { c } = world();
  const phone = await signIn(c);
  const r = await refresh(c, phone);
  assert.equal(r.statusCode, 200);
  assert.equal((await refresh(c, phone)).statusCode, 401);
  assert.equal((await refresh(c, r.cookieSet)).statusCode, 200);
});

test("signing out on one device leaves the other signed in", async () => {
  const { c } = world();
  const phone = await signIn(c);
  const laptop = await signIn(c);
  await c.logout({ cookies: { refresh: phone }, headers: {} }, res());
  assert.equal((await refresh(c, phone)).statusCode, 401);
  assert.equal((await refresh(c, laptop)).statusCode, 200);
});

// "My devices" (2026-11-01): a user sees where they are signed in and signs
// out one device, or every device but this one.
const sidOf = (token) => token.split("~")[1];
const asDevice = (token, extra = {}) => ({ user: { tz: "1", sid: sidOf(token) }, cookies: { refresh: token }, headers: {}, params: {}, ...extra });
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";

test("each sign-in is a listed device, and its tokens carry the session id", async () => {
  const { c, accessClaims } = world();
  const phone = await signIn(c, IPHONE);
  const laptop = await signIn(c, WINDOWS);
  assert.ok(sidOf(phone) && sidOf(laptop) && sidOf(phone) !== sidOf(laptop));
  assert.equal(accessClaims.at(-1).sid, sidOf(laptop));
  const r = res();
  await c.listMyDevices(asDevice(laptop), r);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.body.devices.map((d) => d.label).sort(), ["Chrome · Windows", "Safari · iPhone"]);
  assert.equal(r.body.devices.find((d) => d.current).label, "Chrome · Windows");
});

test("a refresh keeps the device's session id", async () => {
  const { c, accessClaims } = world();
  const phone = await signIn(c, IPHONE);
  const r = await refresh(c, phone);
  assert.equal(sidOf(r.cookieSet), sidOf(phone));
  assert.equal(accessClaims.at(-1).sid, sidOf(phone));
});

test("signing out one device from the list ends that device only", async () => {
  const { c } = world();
  const phone = await signIn(c, IPHONE);
  const laptop = await signIn(c, WINDOWS);
  const r = res();
  await c.signOutDevice(asDevice(laptop, { params: { sid: sidOf(phone) } }), r);
  assert.equal(r.statusCode, 200);
  assert.equal((await refresh(c, phone)).statusCode, 401);
  assert.equal((await refresh(c, laptop)).statusCode, 200);
});

test("signing out an unknown device answers 404", async () => {
  const { c } = world();
  const laptop = await signIn(c, WINDOWS);
  const r = res();
  await c.signOutDevice(asDevice(laptop, { params: { sid: "nope" } }), r);
  assert.equal(r.statusCode, 404);
});

test("signing out other devices keeps only this one", async () => {
  const { c } = world();
  const phone = await signIn(c, IPHONE);
  const tablet = await signIn(c, IPHONE);
  const laptop = await signIn(c, WINDOWS);
  const r = res();
  await c.signOutOtherDevices(asDevice(laptop), r);
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.ended, 2);
  assert.equal((await refresh(c, phone)).statusCode, 401);
  assert.equal((await refresh(c, tablet)).statusCode, 401);
  assert.equal((await refresh(c, laptop)).statusCode, 200);
});

test("getme refuses an access token of a device signed out from the list", async () => {
  const { c } = world();
  const phone = await signIn(c, IPHONE);
  const laptop = await signIn(c, WINDOWS);
  await c.signOutDevice(asDevice(laptop, { params: { sid: sidOf(phone) } }), res());
  const r = res();
  await c.getme({ user: { tz: "1", sid: sidOf(phone) }, headers: {} }, r);
  assert.equal(r.statusCode, 401);
  assert.equal(r.body.code, "TOKEN_STALE");
});
