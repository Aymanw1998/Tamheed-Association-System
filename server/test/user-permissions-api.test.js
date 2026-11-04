// Permission and role endpoints, and the closing of every other way to write
// a role or a permission: putU, postU, register, changeRoom, deleteU, unlock,
// and the automatic lock in login.
const assert = require("node:assert/strict");
const live = require("./helpers/liveStubs");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
// These tests hold the rules with IT's switch off; admin-powers.test.js holds it on.
require("../utils/permissionRules").setAdminPowers(false);
const vm = require("node:vm");
const { actorFor } = require("./helpers/actors");
const { auditStub } = require("./helpers/auditStub");
const { itPermissions } = require("../utils/permissions");

// The rules detect the system account by this tz (read from the real process).
// Synthetic, checksum-valid ID numbers (not real people).
const SYSTEM_TZ = "000000026";
const NEW_TZ = "000000018";
process.env.SYSTEM_ADMIN_TZ = SYSTEM_TZ;

const ADMIN = "ادارة";
const GUIDE = "مرشد";
const HELPER = "مساعد";

// Room-aware in-memory UserModelDef (update upserts, like api.js).
function createUsers(seed = {}) {
  const rooms = { active: [], waiting: [], noActive: [], ...structuredClone(seed) };
  let next = 1;
  // Plain equality, plus { $regex } (the normalized tz existence check).
  const matches = (doc, filter) => Object.keys(filter).every((k) => {
    const want = filter[k];
    if (want && typeof want === "object" && "$regex" in want) return new RegExp(want.$regex).test(String(doc[k] ?? ""));
    return want == null ? doc[k] == null : String(doc[k]) === String(want);
  });
  return {
    collections: { active: "Users" },
    async get(filter = {}, room = "active") {
      const result = rooms[room].filter((d) => matches(d, filter)).map((d) => structuredClone(d));
      return { success: true, count: result.length, result };
    },
    async create(data, room = "active") {
      const doc = { _id: `user-${next++}`, ...structuredClone(data) };
      rooms[room].push(doc);
      return { success: true, result: structuredClone(doc) };
    },
    async update(filter, data, room = "active") {
      const hit = rooms[room].find((d) => matches(d, filter));
      if (hit) Object.assign(hit, structuredClone(data));
      return { success: true, result: hit ? structuredClone(hit) : null };
    },
    // Never creates: result is null when nothing matches (like UserModelDef.updateExisting).
    async updateExisting(filter, data, room = "active") { return this.update(filter, data, room); },
    async delete(filter, room = "active") {
      const before = rooms[room].length;
      rooms[room] = rooms[room].filter((d) => !matches(d, filter));
      return { success: true, result: { deletedCount: before - rooms[room].length } };
    },
    async incrementFailedLogin(tz, room = "active") {
      const hit = rooms[room].find((d) => d.tz === tz);
      hit.failedLoginCount = (Number(hit.failedLoginCount) || 0) + 1;
      return { success: true, result: structuredClone(hit) };
    },
    async lockIfThresholdReached(tz, lockedAt, threshold, room = "active") {
      const hit = rooms[room].find((d) => d.tz === tz && !d.lockedAt && d.failedLoginCount >= threshold);
      if (hit) hit.lockedAt = lockedAt;
      return { success: true, result: hit ? structuredClone(hit) : null };
    },
    rooms,
  };
}

function loadController(users, overrides = {}) {
  const audit = auditStub();
  const dependencies = {
    bcryptjs: {},
    jsonwebtoken: {},
    path,
    "./User.model": { UserModelDef: users },
    "../../utils/otp": require("../utils/otp"),
    "../../utils/sendEmail": {},
    "../../utils/jwt": {},
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
      // Mirrors the real helper: an explicit folder wins, otherwise users/<tz>.
      buildUserStorageFolder: (u = {}) => u.storageFolder || `users/${u.tz}`,
      ensureUserStorageFolder: async () => {},
      syncStorageViewPermissionsForUser: async () => {},
    },
    "../Notification/Notification.controller": {},
    ...require("./helpers/alertEventsStub").noopAlertDeps,
    ...audit.deps,
    ...overrides,
  };
  const filename = path.join(__dirname, "../Entities/User/User.controller.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    console: { log() {}, warn() {}, error() {} },
    process,
    require(name) {
      if (!Object.hasOwn(dependencies, name) && Object.hasOwn(live.deps, name)) return live.deps[name];
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return { controller: module.exports, audit };
}

// Fixture users (made-up identifiers).
const SYS = { _id: "s0", tz: SYSTEM_TZ, firstname: "Sys", lastname: "Tem" };
const MANAGER = { _id: "m1", tz: "manager-1", firstname: "Man", lastname: "Ager", role: ADMIN, roles: [ADMIN],
  permissionGrants: ["permissions.manage", "users.changeRole", "users.unlock"] };
const MANAGER_2 = { ...MANAGER, _id: "m2", tz: "manager-2" };
const ADMIN_USER = { _id: "a1", tz: "admin-1", firstname: "Ad", lastname: "Min", role: ADMIN, roles: [ADMIN] };
const ADMIN_2 = { ...ADMIN_USER, _id: "a2", tz: "admin-2" };
const GUIDE_USER = { _id: "g1", tz: "guide-1", firstname: "Gu", lastname: "Ide", role: GUIDE, roles: [GUIDE],
  permissionGrants: ["vehicles.view"], permissionRevokes: ["ai.use"] };
const HELPER_USER = { _id: "h1", tz: "helper-1", firstname: "He", lastname: "Lper", role: HELPER, roles: [HELPER],
  permissionGrants: ["sports.view"] };

const seed = () => ({ active: [SYS, MANAGER, MANAGER_2, ADMIN_USER, ADMIN_2, GUIDE_USER, HELPER_USER] });
// Acting on the IT site (the `it` actor of the IT-site design): an IT user,
// and the system account there. Only these change permissions.
const IT_USER = { _id: "t1", tz: "it-1", firstname: "I", lastname: "T", role: GUIDE, roles: [GUIDE], isIT: true };
const SYS_IT = { ...SYS, isIT: true };

const actorOf = (user) => actorFor(user, { isSystem: user.tz === SYSTEM_TZ });
const itActorOf = (user) => {
  const isSystem = user.tz === SYSTEM_TZ;
  return { ...actorFor(user, { isSystem }), it: true, permissions: itPermissions(user, { isSystem }) };
};
const req = (actorUser, extra = {}) => ({
  user: { tz: actorUser.tz }, actor: actorUser.isIT ? itActorOf(actorUser) : actorOf(actorUser),
  params: {}, query: {}, body: {}, ip: "127.0.0.1", ...extra,
});
const res = () => ({ statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });
const plain = (v) => JSON.parse(JSON.stringify(v));
const stored = (users, tz, room = "active") => users.rooms[room].find((u) => u.tz === tz);

async function call(handler, actorUser, extra, users = createUsers(seed()), overrides = {}) {
  const { controller, audit } = loadController(users, overrides);
  const out = res();
  await controller[handler](req(actorUser, extra), out);
  return { res: out, body: plain(out.body ?? null), users, audit };
}

const FORBIDDEN = { code: "FORBIDDEN", message: "لا توجد صلاحية" };

/* ================= GET /:tz/permissions ================= */

test("GET permissions returns role, grants, revokes, effective, defaults and grantable", async () => {
  const { res: out, body } = await call("getPermissions", IT_USER, { params: { tz: GUIDE_USER.tz } });
  assert.equal(out.statusCode, 200);
  assert.equal(body.ok, true);
  assert.equal(body.role, GUIDE);
  assert.deepEqual(body.grants, ["vehicles.view"]);
  assert.deepEqual(body.revokes, ["ai.use"]);
  assert.ok(body.effective.includes("vehicles.view"));
  assert.ok(!body.effective.includes("ai.use"));
  assert.ok(body.defaults.includes("lessons.view"));
  assert.ok(!body.defaults.includes("lessons.roster"), "only an admin edits lessons by default");
  assert.ok(!body.defaults.includes("vehicles.view"));
  assert.ok(body.grantable.includes("vehicles.view"));
  assert.ok(!body.grantable.includes("users.passwords"), "IT keys are never grantable");
  assert.equal(body.updatedAt, null);
  assert.equal(body.updatedBy, null);
});

test("GET permissions answers grantable [] when the actor cannot change this target", async () => {
  const otherIt = { ...GUIDE_USER, _id: "t2", tz: "it-2", isIT: true };
  const users = createUsers({ active: [...seed().active, otherIt] });
  const { res: out, body } = await call("getPermissions", IT_USER, { params: { tz: otherIt.tz } }, users);
  assert.equal(out.statusCode, 200);
  assert.deepEqual(body.grantable, []);
  // Outside the IT site nobody changes permissions, however high his rank.
  const everyday = await call("getPermissions", MANAGER, { params: { tz: GUIDE_USER.tz } });
  assert.deepEqual(everyday.body.grantable, []);
});

test("GET permissions of the system account is 404", async () => {
  const { res: out } = await call("getPermissions", MANAGER, { params: { tz: SYSTEM_TZ } });
  assert.equal(out.statusCode, 404);
  const { res: bySystem } = await call("getPermissions", SYS, { params: { tz: SYSTEM_TZ } });
  assert.equal(bySystem.statusCode, 404);
});

test("GET permissions of an unknown user is 404", async () => {
  const { res: out } = await call("getPermissions", MANAGER, { params: { tz: "nobody" } });
  assert.equal(out.statusCode, 404);
});

/* ================= PUT /:tz/permissions ================= */

test("PUT permissions saves grants/revokes, stamps updatedAt/By and records permission_change", async () => {
  const { res: out, body, users, audit } = await call("putPermissions", IT_USER, {
    params: { tz: GUIDE_USER.tz }, body: { grants: ["vehicles.view", "vehicles.edit"], revokes: [] },
  });
  assert.equal(out.statusCode, 200);
  assert.equal(body.ok, true);
  const saved = stored(users, GUIDE_USER.tz);
  assert.deepEqual(saved.permissionGrants, ["vehicles.view", "vehicles.edit"]);
  assert.deepEqual(saved.permissionRevokes, []);
  assert.ok(saved.permissionsUpdatedAt instanceof Date);
  assert.equal(saved.permissionsUpdatedBy, IT_USER.tz);
  const [row] = audit.find({ module: "users", action: "permission_change", targetId: GUIDE_USER.tz });
  assert.ok(row, "permission_change recorded");
  assert.deepEqual(row.before.permissionGrants, ["vehicles.view"]);
  assert.deepEqual(row.after.permissionGrants, ["vehicles.view", "vehicles.edit"]);
  assert.deepEqual(row.before.permissionRevokes, ["ai.use"]);
  assert.deepEqual(row.after.permissionRevokes, []);
});

test("PUT permissions refuses an IT key with 400 NOT_GRANTABLE", async () => {
  const { res: out, body, users } = await call("putPermissions", IT_USER, {
    params: { tz: GUIDE_USER.tz }, body: { grants: ["vehicles.view", "users.passwords"], revokes: [] },
  });
  assert.equal(out.statusCode, 400);
  assert.deepEqual(body, { ok: false, code: "NOT_GRANTABLE" });
  assert.deepEqual(stored(users, GUIDE_USER.tz).permissionGrants, ["vehicles.view"]);
});

test("PUT permissions refuses an unknown key with 400 UNKNOWN_KEY", async () => {
  const { res: out, body } = await call("putPermissions", IT_USER, {
    params: { tz: GUIDE_USER.tz }, body: { grants: ["vehicles.fly"] },
  });
  assert.equal(out.statusCode, 400);
  assert.deepEqual(body, { ok: false, code: "UNKNOWN_KEY" });
});

test("PUT permissions refuses a non-array body with 400 UNKNOWN_KEY", async () => {
  const { res: out, body } = await call("putPermissions", MANAGER, {
    params: { tz: GUIDE_USER.tz }, body: { grants: "vehicles.view" },
  });
  assert.equal(out.statusCode, 400);
  assert.deepEqual(body, { ok: false, code: "UNKNOWN_KEY" });
});

test("PUT permissions on oneself is 400 SELF", async () => {
  const { res: out, body } = await call("putPermissions", MANAGER, {
    params: { tz: MANAGER.tz }, body: { grants: [] },
  });
  assert.equal(out.statusCode, 400);
  assert.deepEqual(body, { ok: false, code: "SELF" });
});

test("PUT permissions by anyone but the IT actor, or on an IT user, is 403", async () => {
  const noKey = await call("putPermissions", ADMIN_USER, { params: { tz: GUIDE_USER.tz }, body: { grants: [] } });
  assert.equal(noKey.res.statusCode, 403);
  assert.deepEqual(noKey.body, FORBIDDEN);
  // A stored permissions.manage grant opens nothing.
  const manager = await call("putPermissions", MANAGER, { params: { tz: GUIDE_USER.tz }, body: { grants: [] } });
  assert.equal(manager.res.statusCode, 403);
  assert.deepEqual(manager.body, FORBIDDEN);
  const otherIt = { ...GUIDE_USER, _id: "t2", tz: "it-2", isIT: true };
  const users = createUsers({ active: [...seed().active, otherIt] });
  const itPeer = await call("putPermissions", IT_USER, { params: { tz: otherIt.tz }, body: { grants: [] } }, users);
  assert.equal(itPeer.res.statusCode, 403);
  assert.equal((await call("putPermissions", SYS_IT, { params: { tz: otherIt.tz }, body: { grants: [] } }, users)).res.statusCode, 200);
});

test("PUT permissions on the system account is 404", async () => {
  const { res: out, users } = await call("putPermissions", MANAGER, { params: { tz: SYSTEM_TZ }, body: { grants: ["ai"] } });
  assert.equal(out.statusCode, 404);
  assert.equal(stored(users, SYSTEM_TZ).permissionGrants, undefined);
});

test("the system account changes permissions on the IT site only, never grants an IT key; updatedBy never names its tz", async () => {
  const everyday = await call("putPermissions", SYS, {
    params: { tz: GUIDE_USER.tz }, body: { grants: ["vehicles.edit"], revokes: [] },
  });
  assert.equal(everyday.res.statusCode, 403);
  const itKey = await call("putPermissions", SYS_IT, {
    params: { tz: GUIDE_USER.tz }, body: { grants: ["users.passwords"], revokes: [] },
  });
  assert.equal(itKey.res.statusCode, 400);
  assert.deepEqual(itKey.body, { ok: false, code: "NOT_GRANTABLE" });
  const { res: out, users } = await call("putPermissions", SYS_IT, {
    params: { tz: GUIDE_USER.tz }, body: { grants: ["vehicles.edit"], revokes: [] },
  });
  assert.equal(out.statusCode, 200);
  const saved = stored(users, GUIDE_USER.tz);
  assert.deepEqual(saved.permissionGrants, ["vehicles.edit"]);
  assert.equal(saved.permissionsUpdatedBy, "system");
});

test("PUT permissions validates only what changed: an old grant the IT actor may not give survives a resubmit", async () => {
  // An IT-key grant stored before the IT site (ignored, but still on record).
  const oldGrant = () => createUsers({ active: [...seed().active.filter((u) => u !== HELPER_USER),
    { ...HELPER_USER, permissionGrants: ["sports.view", "audit.view"] }] });
  const kept = await call("putPermissions", IT_USER, {
    params: { tz: HELPER_USER.tz }, body: { grants: ["sports.view", "audit.view", "vehicles.view"], revokes: [] },
  }, oldGrant());
  assert.equal(kept.res.statusCode, 200);
  assert.deepEqual(stored(kept.users, HELPER_USER.tz).permissionGrants, ["sports.view", "audit.view", "vehicles.view"]);

  const removed = await call("putPermissions", IT_USER, {
    params: { tz: HELPER_USER.tz }, body: { grants: ["sports.view"], revokes: [] },
  }, oldGrant());
  assert.equal(removed.res.statusCode, 400);
  assert.deepEqual(removed.body, { ok: false, code: "NOT_GRANTABLE" });
});

/* ================= PUT /:tz/role ================= */

test("PUT role demotes, clears special permissions and records role_change", async () => {
  const { res: out, body, users, audit } = await call("putRole", MANAGER, {
    params: { tz: GUIDE_USER.tz }, body: { role: HELPER },
  });
  assert.equal(out.statusCode, 200);
  assert.equal(body.ok, true);
  assert.equal(body.demoted, true);
  const saved = stored(users, GUIDE_USER.tz);
  assert.equal(saved.role, HELPER);
  assert.deepEqual(saved.roles, [HELPER]);
  assert.deepEqual(saved.permissionGrants, []);
  assert.deepEqual(saved.permissionRevokes, []);
  const [row] = audit.find({ module: "users", action: "role_change", targetId: GUIDE_USER.tz });
  assert.equal(row.before.role, GUIDE);
  assert.equal(row.after.role, HELPER);
});

test("PUT role and PUT permissions pass the actor to the access_changed alert (so it skips him)", async () => {
  const seen = [];
  const capture = { "../../services/alertEvents": {
    ...require("./helpers/alertEventsStub").noopAlertDeps["../../services/alertEvents"],
    accessChanged: async (target, options) => { seen.push({ tz: target.tz, ...options }); return { created: [] }; },
  } };
  await call("putRole", MANAGER, { params: { tz: GUIDE_USER.tz }, body: { role: HELPER } }, createUsers(seed()), capture);
  await call("putPermissions", IT_USER, { params: { tz: GUIDE_USER.tz }, body: { grants: [], revokes: [] } }, createUsers(seed()), capture);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(seen, [
    { tz: GUIDE_USER.tz, change: "role", actorTz: MANAGER.tz },
    { tz: GUIDE_USER.tz, change: "permissions", actorTz: IT_USER.tz },
  ]);
});

test("PUT role promotion keeps special permissions", async () => {
  const { res: out, body, users } = await call("putRole", MANAGER, {
    params: { tz: HELPER_USER.tz }, body: { role: GUIDE },
  });
  assert.equal(out.statusCode, 200);
  assert.equal(body.demoted, false);
  const saved = stored(users, HELPER_USER.tz);
  assert.equal(saved.role, GUIDE);
  assert.deepEqual(saved.permissionGrants, ["sports.view"]);
});

test("PUT role without users.changeRole is 403; an admin holds it by default", async () => {
  const noKey = { ...ADMIN_USER, permissionRevokes: ["users.changeRole"] };
  const { res: out, body, users } = await call("putRole", noKey, {
    params: { tz: GUIDE_USER.tz }, body: { role: HELPER },
  });
  assert.equal(out.statusCode, 403);
  assert.deepEqual(body, FORBIDDEN);
  assert.equal(stored(users, GUIDE_USER.tz).role, GUIDE);
  const byDefault = await call("putRole", ADMIN_USER, { params: { tz: GUIDE_USER.tz }, body: { role: HELPER } });
  assert.equal(byDefault.res.statusCode, 200);
  assert.equal(stored(byDefault.users, GUIDE_USER.tz).role, HELPER);
});

test("PUT role on oneself or an equal-rank user is 403", async () => {
  const self = await call("putRole", MANAGER, { params: { tz: MANAGER.tz }, body: { role: GUIDE } });
  assert.equal(self.res.statusCode, 403);
  const peer = await call("putRole", MANAGER, { params: { tz: ADMIN_USER.tz }, body: { role: GUIDE } });
  assert.equal(peer.res.statusCode, 403);
});

test("PUT role with an unknown or missing role is 400 UNKNOWN_ROLE", async () => {
  for (const role of ["nonsense", "", undefined]) {
    const { res: out, body } = await call("putRole", MANAGER, { params: { tz: GUIDE_USER.tz }, body: { role } });
    assert.equal(out.statusCode, 400, `role ${JSON.stringify(role)}`);
    assert.deepEqual(body, { ok: false, code: "UNKNOWN_ROLE" });
  }
});

test("PUT role on the system account is 404", async () => {
  const { res: out } = await call("putRole", SYS, { params: { tz: SYSTEM_TZ }, body: { role: GUIDE } });
  assert.equal(out.statusCode, 404);
});

/* ================= POST /:tz/unlock ================= */

test("unlock clears the failure counter and the lock, and records unlock", async () => {
  const users = createUsers({ active: [MANAGER, { ...GUIDE_USER, failedLoginCount: 5, lockedAt: new Date() }] });
  const { res: out, audit } = await call("unlockUser", MANAGER, { params: { tz: GUIDE_USER.tz } }, users);
  assert.equal(out.statusCode, 200);
  const saved = stored(users, GUIDE_USER.tz);
  assert.equal(saved.failedLoginCount, 0);
  assert.equal(saved.lockedAt, null);
  const [row] = audit.find({ module: "users", action: "unlock", targetId: GUIDE_USER.tz });
  assert.ok(row, "unlock recorded");
});

test("unlock of a user the actor cannot manage is 403; of the system account 404", async () => {
  const peer = await call("unlockUser", MANAGER, { params: { tz: MANAGER_2.tz } });
  assert.equal(peer.res.statusCode, 403);
  const sys = await call("unlockUser", MANAGER, { params: { tz: SYSTEM_TZ } });
  assert.equal(sys.res.statusCode, 404);
});

/* ================= signOutEverywhere ================= */
// The owner's rule (2026-11-01): a user stays signed in until he signs out
// or an admin signs him out; that ends every device's session at once.

test("sign out everywhere ends every session, stamps signedOutAt and records it", async () => {
  const users = createUsers({ active: [MANAGER, { ...GUIDE_USER, refreshHashes: ["h1", "h2"] }] });
  const before = Date.now();
  const { res: out, audit } = await call("signOutEverywhere", MANAGER, { params: { tz: GUIDE_USER.tz } }, users);
  assert.equal(out.statusCode, 200);
  const saved = stored(users, GUIDE_USER.tz);
  assert.deepEqual(plain(saved.refreshHashes), []);
  assert.ok(new Date(saved.signedOutAt).getTime() >= before);
  assert.ok(audit.find({ module: "users", action: "sign_out_all", targetId: GUIDE_USER.tz })[0], "recorded");
});

test("sign out everywhere of a user the actor cannot manage is 403; of the system account 404", async () => {
  assert.equal((await call("signOutEverywhere", MANAGER, { params: { tz: MANAGER_2.tz } })).res.statusCode, 403);
  assert.equal((await call("signOutEverywhere", MANAGER, { params: { tz: SYSTEM_TZ } })).res.statusCode, 404);
});

/* ================= putU ================= */

test("putU strips role, permission, vehicle, lockout and session fields from an admin edit", async () => {
  const { res: out, users, audit } = await call("putU", ADMIN_USER, {
    params: { tz: GUIDE_USER.tz },
    body: {
      firstname: "Renamed",
      role: ADMIN, roles: [ADMIN],
      permissionGrants: ["permissions.manage"], permissionRevokes: ["lessons.view"],
      vehiclePermissions: ["view", "edit"],
      failedLoginCount: 0, lockedAt: null, passwordChangedAt: "2000-01-01",
      refreshHash: "injected", signedOutAt: "2000-01-01", resetOtpHash: "injected", resetOtpExpires: "2099-01-01",
      resetOtpAttempts: 0, resetOtpLockedUntil: "2000-01-01",
    },
  });
  assert.equal(out.statusCode, 200);
  const { updatedAt, updatedBy, updatedByName, ...saved } = stored(users, GUIDE_USER.tz);
  assert.equal(updatedByName, "Ad Min");
  assert.ok(updatedBy);
  assert.ok(updatedAt, "the save stamps updatedAt");
  assert.deepEqual(plain(saved), plain({ ...GUIDE_USER, firstname: "Renamed" }));
  assert.equal(audit.find({ action: "role_change" }).length, 0);
  assert.equal(audit.find({ action: "permission_change" }).length, 0);
});

test("putU drops storagePermissions unless the actor holds files.manageAll", async () => {
  const editor = { ...ADMIN_USER, permissionRevokes: ["files.manageAll"] };
  const body = { firstname: "Updated", storagePermissions: { view: ["*"] } };

  const denied = await call("putU", editor, { params: { tz: GUIDE_USER.tz }, body });
  assert.equal(denied.res.statusCode, 200);
  assert.equal(stored(denied.users, GUIDE_USER.tz).firstname, "Updated");
  assert.equal(stored(denied.users, GUIDE_USER.tz).storagePermissions, undefined);

  const allowed = await call("putU", ADMIN_USER, { params: { tz: GUIDE_USER.tz }, body });
  assert.deepEqual(stored(allowed.users, GUIDE_USER.tz).storagePermissions, { view: ["*"] });
  assert.equal(allowed.audit.find({ action: "permission_change" }).length, 1);
});

test("putU of an equal-rank user is 403; of the system account 404", async () => {
  const peer = await call("putU", ADMIN_USER, { params: { tz: ADMIN_2.tz }, body: { firstname: "X" } });
  assert.equal(peer.res.statusCode, 403);
  assert.deepEqual(peer.body, FORBIDDEN);
  assert.equal(stored(peer.users, ADMIN_2.tz).firstname, "Ad");
  const sys = await call("putU", ADMIN_USER, { params: { tz: SYSTEM_TZ }, body: { firstname: "X" } });
  assert.equal(sys.res.statusCode, 404);
});

test("putU of a missing user writes nothing", async () => {
  const { res: out, users } = await call("putU", ADMIN_USER, { params: { tz: "nobody" }, body: { firstname: "X" } });
  assert.equal(out.statusCode, 404);
  assert.equal(stored(users, "nobody"), undefined);
});

/* ================= postU ================= */

test("postU: a default admin (users.create) may create a user with a role below his own", async () => {
  const { res: out, users } = await call("postU", ADMIN_USER, {
    body: { tz: NEW_TZ, password: "placeholder", firstname: "N", lastname: "S", phone: "050", roles: [GUIDE] },
  });
  assert.equal(out.statusCode, 201);
  const saved = stored(users, NEW_TZ);
  assert.equal(saved.role, GUIDE);
  assert.deepEqual(saved.roles, [GUIDE]);
});

test("postU: a default admin may not create another admin (403)", async () => {
  const { res: out, users } = await call("postU", ADMIN_USER, {
    body: { tz: NEW_TZ, password: "placeholder", firstname: "N", lastname: "S", phone: "050", roles: [ADMIN] },
  });
  assert.equal(out.statusCode, 403);
  assert.equal(stored(users, NEW_TZ), undefined);
});

test("postU: a creator must hold every default leaf of the role he gives", async () => {
  const guideCreator = { ...GUIDE_USER, permissionGrants: ["users.create"] };
  const { res: out } = await call("postU", guideCreator, {
    body: { tz: NEW_TZ, password: "placeholder", firstname: "N", lastname: "S", phone: "050", roles: [HELPER] },
  }, createUsers({ active: [SYS, guideCreator] }));
  // GUIDE_USER has ai.use revoked, and ai.use is a helper default.
  assert.equal(out.statusCode, 403);
});

test("postU by a role manager stores the single role and no grants", async () => {
  const { res: out, users } = await call("postU", MANAGER, {
    body: { tz: NEW_TZ, password: "placeholder", firstname: "N", lastname: "S", phone: "050", role: GUIDE,
      permissionGrants: ["ai"], permissionRevokes: ["ai"], vehiclePermissions: ["view"] },
  });
  assert.equal(out.statusCode, 201);
  const saved = stored(users, NEW_TZ);
  assert.equal(saved.role, GUIDE);
  assert.deepEqual(saved.roles, [GUIDE]);
  assert.deepEqual(saved.permissionGrants, []);
  assert.deepEqual(saved.permissionRevokes, []);
  assert.equal(saved.vehiclePermissions, undefined);
});

test("postU with an unknown role is 400 UNKNOWN_ROLE", async () => {
  const { res: out, body } = await call("postU", MANAGER, {
    body: { tz: NEW_TZ, password: "placeholder", firstname: "N", lastname: "S", phone: "050", role: "nonsense" },
  });
  assert.equal(out.statusCode, 400);
  assert.deepEqual(body, { ok: false, code: "UNKNOWN_ROLE" });
});

test("postU without a role is refused", async () => {
  const { res: out, body, users } = await call("postU", ADMIN_USER, { body: { tz: NEW_TZ, password: "placeholder", firstname: "N", lastname: "S", phone: "050" } });
  assert.equal(out.statusCode, 400);
  assert.equal(body.code, "MISSING_FIELDS");
  assert.equal(stored(users, NEW_TZ), undefined);
});

/* ================= register ================= */

test("register ignores any submitted role and permission fields", async () => {
  const users = createUsers();
  const { controller } = loadController(users);
  const out = res();
  await controller.register({ body: {
    tz: NEW_TZ, password: "placeholder", firstname: "New",
    roles: [ADMIN], role: ADMIN, vehiclePermissions: ["view"],
    storagePermissions: { view: ["*"] }, permissionGrants: ["permissions.manage"], permissionRevokes: ["ai"],
  } }, out);
  assert.equal(out.statusCode, 200);
  const saved = stored(users, NEW_TZ, "waiting");
  assert.deepEqual(saved.roles, []);
  assert.equal(saved.role, null);
  for (const field of ["vehiclePermissions", "storagePermissions", "permissionGrants", "permissionRevokes"]) {
    assert.equal(saved[field], undefined, `${field} must not be stored`);
  }
});

test("register announces the new waiting user to open staff screens", async () => {
  const users = createUsers();
  const { controller } = loadController(users);
  live.changes.length = 0;
  await controller.register({ body: { tz: NEW_TZ, password: "placeholder", firstname: "New" } }, res());
  const saved = stored(users, NEW_TZ, "waiting");
  assert.deepEqual(live.changes.filter(([entity]) => entity === "user"), [["user", saved._id]]);
});

test("register ignores storageFolder and googleDrive from the body", async () => {
  const users = createUsers();
  const { controller } = loadController(users);
  const out = res();
  await controller.register({ body: {
    tz: NEW_TZ, password: "placeholder", storageFolder: "someone-elses-folder", googleDrive: { refreshToken: "x" },
  } }, out);
  assert.equal(out.statusCode, 200);
  const saved = stored(users, NEW_TZ, "waiting");
  assert.equal(saved.storageFolder, `users/${NEW_TZ}`);
  assert.equal(saved.googleDrive, undefined);
});

test("postU ignores storageFolder and googleDrive from the body", async () => {
  const { res: out, users } = await call("postU", ADMIN_USER, { body: {
    tz: NEW_TZ, password: "placeholder", firstname: "N", lastname: "S", phone: "050", role: GUIDE, storageFolder: "someone-elses-folder", googleDrive: { refreshToken: "x" },
  } });
  assert.equal(out.statusCode, 201);
  const saved = stored(users, NEW_TZ);
  assert.equal(saved.storageFolder, `users/${NEW_TZ}`);
  assert.equal(saved.googleDrive, undefined);
});

/* ================= changeRoom ================= */

const WAITING = { _id: "w1", tz: "waiting-1", firstname: "New", lastname: "Comer", roles: [], role: null };
const roomSeed = () => createUsers({ ...seed(), waiting: [WAITING] });

test("approving a waiting user without a role is 400 and moves nothing", async () => {
  const { res: out, body, users } = await call("changeRoom", MANAGER, {
    params: { tz: WAITING.tz }, body: { from: "waiting", to: "active" },
  }, roomSeed());
  assert.equal(out.statusCode, 400);
  assert.equal(body.ok, false);
  assert.ok(stored(users, WAITING.tz, "waiting"));
  assert.equal(stored(users, WAITING.tz, "active"), undefined);
});

test("approving with an unknown role is 400 UNKNOWN_ROLE", async () => {
  const { res: out, body } = await call("changeRoom", MANAGER, {
    params: { tz: WAITING.tz }, body: { from: "waiting", to: "active", role: "nonsense" },
  }, roomSeed());
  assert.equal(out.statusCode, 400);
  assert.deepEqual(body, { ok: false, code: "UNKNOWN_ROLE" });
});

test("a default admin (users.approve, no users.changeRole) approves a waiting user as مرشد", async () => {
  const { res: out, users } = await call("changeRoom", ADMIN_USER, {
    params: { tz: WAITING.tz }, body: { from: "waiting", to: "active", role: GUIDE },
  }, roomSeed());
  assert.equal(out.statusCode, 200);
  assert.equal(stored(users, WAITING.tz, "active").role, GUIDE);
  assert.deepEqual(stored(users, WAITING.tz, "active").roles, [GUIDE]);
});

test("a default admin cannot approve at their own rank (ادارة) — 403", async () => {
  const { res: out, users } = await call("changeRoom", ADMIN_USER, {
    params: { tz: WAITING.tz }, body: { from: "waiting", to: "active", role: ADMIN },
  }, roomSeed());
  assert.equal(out.statusCode, 403);
  assert.ok(stored(users, WAITING.tz, "waiting"));
});

test("a guide (no users.approve) cannot approve — 403", async () => {
  const { res: out, users } = await call("changeRoom", GUIDE_USER, {
    params: { tz: WAITING.tz }, body: { from: "waiting", to: "active", role: HELPER },
  }, roomSeed());
  assert.equal(out.statusCode, 403);
  assert.ok(stored(users, WAITING.tz, "waiting"));
});

test("an approver missing a default leaf of the role cannot approve as it — 403", async () => {
  const lacking = { ...ADMIN_USER, permissionRevokes: ["attendance.record"] };
  const { res: out } = await call("changeRoom", lacking, {
    params: { tz: WAITING.tz }, body: { from: "waiting", to: "active", role: GUIDE },
  }, roomSeed());
  assert.equal(out.statusCode, 403);
});

test("a default admin approving without a role is 400", async () => {
  const { res: out } = await call("changeRoom", ADMIN_USER, {
    params: { tz: WAITING.tz }, body: { from: "waiting", to: "active" },
  }, roomSeed());
  assert.equal(out.statusCode, 400);
});

test("approving with an assignable role stores it and records approve", async () => {
  const { res: out, users, audit } = await call("changeRoom", MANAGER, {
    params: { tz: WAITING.tz }, body: { from: "waiting", to: "active", role: GUIDE },
  }, roomSeed());
  assert.equal(out.statusCode, 200);
  const saved = stored(users, WAITING.tz, "active");
  assert.equal(saved.role, GUIDE);
  assert.deepEqual(saved.roles, [GUIDE]);
  assert.equal(stored(users, WAITING.tz, "waiting"), undefined);
  assert.ok(audit.find({ action: "approve", targetId: WAITING.tz })[0]);
});

test("other room moves need canManageTarget", async () => {
  const peer = await call("changeRoom", ADMIN_USER, {
    params: { tz: ADMIN_2.tz }, body: { from: "active", to: "noActive" },
  });
  assert.equal(peer.res.statusCode, 403);
  assert.ok(stored(peer.users, ADMIN_2.tz));

  const lower = await call("changeRoom", ADMIN_USER, {
    params: { tz: GUIDE_USER.tz }, body: { from: "active", to: "noActive" },
  });
  assert.equal(lower.res.statusCode, 200);
  assert.ok(stored(lower.users, GUIDE_USER.tz, "noActive"));

  const sys = await call("changeRoom", ADMIN_USER, {
    params: { tz: SYSTEM_TZ }, body: { from: "active", to: "noActive" },
  });
  assert.equal(sys.res.statusCode, 404);
  assert.ok(stored(sys.users, SYSTEM_TZ));
});

/* ================= deleteU ================= */

test("deleteU needs canManageTarget; the system account is 404", async () => {
  const peer = await call("deleteU", ADMIN_USER, { params: { tz: ADMIN_2.tz, from: "active" } });
  assert.equal(peer.res.statusCode, 403);
  assert.ok(stored(peer.users, ADMIN_2.tz));

  const lower = await call("deleteU", ADMIN_USER, { params: { tz: GUIDE_USER.tz, from: "active" } });
  assert.equal(lower.res.statusCode, 200);
  assert.equal(stored(lower.users, GUIDE_USER.tz), undefined);

  const sys = await call("deleteU", ADMIN_USER, { params: { tz: SYSTEM_TZ, from: "active" } });
  assert.equal(sys.res.statusCode, 404);
  assert.ok(stored(sys.users, SYSTEM_TZ));
});

/* ================= login: automatic lock ================= */

test("the fifth failed sign-in records a lock by the system", async () => {
  const users = createUsers({ active: [{ ...GUIDE_USER, password: "enc:right", failedLoginCount: 4, lockedAt: null }] });
  const { controller, audit } = loadController(users);
  const out = res();
  await controller.login({ body: { tz: GUIDE_USER.tz, password: "wrong" }, headers: {}, cookies: {}, ip: "127.0.0.1" }, out);
  assert.equal(out.statusCode, 401);
  const rows = audit.find({ module: "users", action: "lock", targetId: GUIDE_USER.tz });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].req.actor.isSystem, true);
  const { actorLabel } = require("../middleware/permissionMiddleware");
  assert.deepEqual(actorLabel(rows[0].req.actor), { actor: "system", actorName: "النظام" });
  assert.equal(rows[0].before.lockedAt, null);
  assert.ok(rows[0].after.lockedAt);
});

test("a failure below the threshold records no lock", async () => {
  const users = createUsers({ active: [{ ...GUIDE_USER, password: "enc:right", failedLoginCount: 1, lockedAt: null }] });
  const { controller, audit } = loadController(users);
  await controller.login({ body: { tz: GUIDE_USER.tz, password: "wrong" }, headers: {}, cookies: {} }, res());
  assert.equal(audit.find({ action: "lock" }).length, 0);
});

/* ================= legacy translation is gone ================= */

test("the legacy role/vehicle translation helper is gone", () => {
  assert.equal(require("../utils/permissions").applyLegacyEditToPermissions, undefined);
});

/* ================= fix round 1 ================= */

test("postU refuses a padded system tz, and the stored tz is never padded", async () => {
  const users = createUsers({ active: [ADMIN_USER] }); // the system account is not in the store
  const { res: out } = await call("postU", ADMIN_USER, { body: { tz: `${SYSTEM_TZ} `, password: "placeholder" } }, users);
  assert.equal(out.statusCode, 409);
  assert.equal(users.rooms.active.length, 1);
  assert.equal(users.rooms.waiting.length, 0);

  const ok = await call("postU", ADMIN_USER, { body: { tz: ` ${NEW_TZ} `, password: "placeholder", firstname: "N", lastname: "S", phone: "050", role: GUIDE } });
  assert.equal(ok.res.statusCode, 201);
  assert.ok(stored(ok.users, NEW_TZ), "stored under the trimmed tz");
});

test("register refuses a padded system tz", async () => {
  const users = createUsers();
  const { controller } = loadController(users);
  const out = res();
  await controller.register({ body: { tz: ` ${SYSTEM_TZ}`, password: "placeholder" } }, out);
  assert.equal(out.statusCode, 400);
  assert.equal(users.rooms.waiting.length, 0);
});

test("postU and register refuse an empty or invalid ID number", async () => {
  for (const tz of ["", "   ", "abc", "123456789", "000000019"]) {
    const post = await call("postU", ADMIN_USER, { body: { tz, password: "placeholder" } });
    assert.equal(post.res.statusCode, 400, `postU ${JSON.stringify(tz)}`);
    assert.equal(post.body.code, "INVALID_TZ");

    const users = createUsers();
    const { controller } = loadController(users);
    const out = res();
    await controller.register({ body: { tz, password: "placeholder" } }, out);
    assert.equal(out.statusCode, 400, `register ${JSON.stringify(tz)}`);
    assert.equal(users.rooms.waiting.length, 0);
  }
});

test("postU finds an existing user by the trimmed tz", async () => {
  const users = createUsers({ active: [ADMIN_USER, { _id: "e1", tz: NEW_TZ }] });
  const { res: out } = await call("postU", ADMIN_USER, { body: { tz: `${NEW_TZ} `, password: "placeholder" } }, users);
  assert.equal(out.statusCode, 409);
  assert.equal(users.rooms.active.length, 2);
});

test("putU never renames a user: body tz is ignored", async () => {
  for (const tz of [SYSTEM_TZ, `${SYSTEM_TZ} `, "renamed-user"]) {
    const { res: out, users } = await call("putU", ADMIN_USER, { params: { tz: GUIDE_USER.tz }, body: { tz, firstname: "X" } });
    assert.equal(out.statusCode, 200);
    const saved = stored(users, GUIDE_USER.tz);
    assert.ok(saved, "still stored under its own tz");
    assert.equal(saved.firstname, "X");
    assert.equal(users.rooms.active.filter((u) => u.tz.trim() === SYSTEM_TZ).length, 1);
  }
});

test("putU ignores storageFolder and googleDrive", async () => {
  const { res: out, users } = await call("putU", ADMIN_USER, {
    params: { tz: GUIDE_USER.tz }, body: { firstname: "X", storageFolder: "someone-elses-folder", googleDrive: { refreshToken: "x" } },
  });
  assert.equal(out.statusCode, 200);
  const saved = stored(users, GUIDE_USER.tz);
  assert.equal(saved.storageFolder, undefined);
  assert.equal(saved.googleDrive, undefined);
});

test("a stored user whose tz only matches the system tz after trimming is not the system account", async () => {
  const { createLoadActor } = require("../middleware/permissionMiddleware");
  const loadActor = createLoadActor({ findActiveUserByTz: async () => ({ _id: "p1", tz: `${SYSTEM_TZ} `, role: GUIDE }) });
  const r = { user: { tz: `${SYSTEM_TZ} ` } };
  let called = false;
  await loadActor(r, res(), () => { called = true; });
  assert.ok(called);
  assert.equal(r.actor.isSystem, false);
  assert.ok(!r.actor.permissions.has("permissions.manage"));
  const { canManageTarget } = require("../utils/permissionRules");
  assert.equal(canManageTarget(actorOf(MANAGER), { tz: `${SYSTEM_TZ} `, role: HELPER }), true);
});

test("getme does not treat a padded tz as the system account", async () => {
  const users = createUsers({ active: [{ _id: "p1", tz: ` ${SYSTEM_TZ}`, role: HELPER, roles: [HELPER] }] });
  const { controller } = loadController(users);
  const out = res();
  await controller.getme({ user: { tz: ` ${SYSTEM_TZ}` } }, out);
  assert.equal(out.statusCode, 200);
  assert.ok(!plain(out.body).permissions.includes("permissions.manage"));
});

test("an admin cannot re-approve a user who already has a role (needs users.changeRole)", async () => {
  const users = createUsers(seed());
  const noChangeRole = { ...ADMIN_USER, permissionRevokes: ["users.changeRole"] };
  const moved = await call("changeRoom", noChangeRole, {
    params: { tz: HELPER_USER.tz }, body: { from: "active", to: "waiting" },
  }, users);
  assert.equal(moved.res.statusCode, 200);
  const approved = await call("changeRoom", noChangeRole, {
    params: { tz: HELPER_USER.tz }, body: { from: "waiting", to: "active", role: GUIDE },
  }, users);
  assert.equal(approved.res.statusCode, 403);
  assert.equal(stored(users, HELPER_USER.tz, "waiting").role, HELPER);
});

test("moving a role-less user from noActive to active is an approval and needs a role", async () => {
  const roleless = { _id: "n1", tz: "noactive-1", firstname: "No", lastname: "Role", roles: [], role: null };
  const users = createUsers({ ...seed(), noActive: [roleless] });
  const noRole = await call("changeRoom", ADMIN_USER, {
    params: { tz: roleless.tz }, body: { from: "noActive", to: "active" },
  }, users);
  assert.equal(noRole.res.statusCode, 400);
  assert.ok(stored(users, roleless.tz, "noActive"));

  const withRole = await call("changeRoom", ADMIN_USER, {
    params: { tz: roleless.tz }, body: { from: "noActive", to: "active", role: GUIDE },
  }, users);
  assert.equal(withRole.res.statusCode, 200);
  assert.equal(stored(users, roleless.tz, "active").role, GUIDE);
});

test("reactivating a user who has a role needs only canManageTarget", async () => {
  const users = createUsers({ ...seed(), noActive: [{ ...HELPER_USER, _id: "h9", tz: "helper-9" }] });
  const { res: out } = await call("changeRoom", ADMIN_USER, {
    params: { tz: "helper-9" }, body: { from: "noActive", to: "active" },
  }, users);
  assert.equal(out.statusCode, 200);
  assert.equal(stored(users, "helper-9", "active").role, HELPER);
});

test("PUT role cannot assign the actor's own rank", async () => {
  const { res: out, users } = await call("putRole", MANAGER, { params: { tz: GUIDE_USER.tz }, body: { role: ADMIN } });
  assert.equal(out.statusCode, 403);
  assert.equal(stored(users, GUIDE_USER.tz).role, GUIDE);
});

test("PATCH storage-permissions needs canManageTarget; system and missing targets are 404", async () => {
  const body = { storagePermissions: { view: ["a"] } };
  const peer = await call("updateStoragePermissions", ADMIN_USER, { params: { tz: ADMIN_2.tz }, body });
  assert.equal(peer.res.statusCode, 403);
  assert.equal(stored(peer.users, ADMIN_2.tz).storagePermissions, undefined);

  const sys = await call("updateStoragePermissions", ADMIN_USER, { params: { tz: SYSTEM_TZ }, body });
  assert.equal(sys.res.statusCode, 404);
  assert.equal(stored(sys.users, SYSTEM_TZ).storagePermissions, undefined);

  const missing = await call("updateStoragePermissions", ADMIN_USER, { params: { tz: "nobody" }, body });
  assert.equal(missing.res.statusCode, 404);
  assert.equal(stored(missing.users, "nobody"), undefined);

  const lower = await call("updateStoragePermissions", ADMIN_USER, { params: { tz: GUIDE_USER.tz }, body });
  assert.equal(lower.res.statusCode, 200);
  assert.deepEqual(stored(lower.users, GUIDE_USER.tz).storagePermissions.view, ["a"]);
});

test("PUT permissions stores trimmed keys", async () => {
  const { res: out, users } = await call("putPermissions", IT_USER, {
    params: { tz: GUIDE_USER.tz }, body: { grants: ["vehicles.view", " vehicles.edit ", "vehicles.edit"], revokes: [" ai.use"] },
  });
  assert.equal(out.statusCode, 200);
  const saved = stored(users, GUIDE_USER.tz);
  assert.deepEqual(saved.permissionGrants, ["vehicles.view", "vehicles.edit"]);
  assert.deepEqual(saved.permissionRevokes, ["ai.use"]);
});

test("records written by PUT role, PUT permissions and register need no migration", async () => {
  const users = createUsers(seed());
  await call("putRole", MANAGER, { params: { tz: GUIDE_USER.tz }, body: { role: HELPER } }, users);
  await call("putPermissions", IT_USER, { params: { tz: HELPER_USER.tz }, body: { grants: ["sports.view", "vehicles.view"], revokes: ["ai.use"] } }, users);
  const { controller } = loadController(users);
  await controller.register({ body: { tz: NEW_TZ, password: "placeholder", roles: [ADMIN] } }, res());

  const records = [stored(users, GUIDE_USER.tz), stored(users, HELPER_USER.tz), stored(users, NEW_TZ, "waiting")].map(plain);
  assert.ok(records.every(Boolean), "all three records were written");
  const { planUserMigration, migrateUsers } = require("../scripts/migratePermissions");
  for (const record of records) {
    const plan = planUserMigration(record);
    assert.equal(plan.role, record.role ?? null, record.tz);
    assert.deepEqual(plan.roles, record.roles, record.tz);
    assert.deepEqual(plan.permissionGrants, record.permissionGrants ?? [], record.tz);
    assert.deepEqual(plan.permissionRevokes, record.permissionRevokes ?? [], record.tz);
  }
  const writes = [];
  const model = {
    async get(filter, room) { return { success: true, result: room === "active" ? records : [] }; },
    async update(...args) { writes.push(args); return { success: true }; },
  };
  const result = await migrateUsers(model, { apply: true, systemTz: "" });
  assert.equal(result.errors, 0);
  assert.deepEqual(writes, []);
});

test("postU: a guide with users.create may create a helper (role below his own, defaults held)", async () => {
  const guideCreator = { ...GUIDE_USER, permissionGrants: ["users.create"], permissionRevokes: [] };
  const { res: out, users } = await call("postU", guideCreator, {
    body: { tz: NEW_TZ, password: "placeholder", firstname: "N", lastname: "S", phone: "050", roles: [HELPER] },
  }, createUsers({ active: [SYS, guideCreator] }));
  assert.equal(out.statusCode, 201);
  assert.equal(stored(users, NEW_TZ).role, HELPER);
});

/* ================= Phase 4 final-review fixes ================= */

// 1. Passwords of other users: users.resetPassword on a user of lower rank.
const PW_GUIDE = { ...GUIDE_USER, password: "enc:old-placeholder" };
const pwSeed = (actor) => createUsers({
  active: [SYS, actor, PW_GUIDE].filter((u, i, all) => all.findIndex((x) => x.tz === u.tz) === i),
});

test("putU: an admin without users.resetPassword cannot set another user's password; the rest applies", async () => {
  const withoutReset = { ...ADMIN_USER, permissionRevokes: ["users.resetPassword"] };
  const { res: out, users } = await call("putU", withoutReset, {
    params: { tz: PW_GUIDE.tz }, body: { firstname: "Renamed", password: "new-placeholder" },
  }, pwSeed(withoutReset));
  assert.equal(out.statusCode, 200);
  const saved = stored(users, PW_GUIDE.tz);
  assert.equal(saved.password, "enc:old-placeholder");
  assert.equal(saved.firstname, "Renamed");
});

test("putU: users.resetPassword on a lower rank sets the password; users.passwords (IT key) adds nothing", async () => {
  // An administrator, the system account (the everyday app keeps every non-IT key).
  for (const actor of [ADMIN_USER, SYS]) {
    const { res: out, users } = await call("putU", actor, {
      params: { tz: PW_GUIDE.tz }, body: { password: "new-placeholder" },
    }, pwSeed(actor));
    assert.equal(out.statusCode, 200, actor.tz);
    assert.equal(stored(users, PW_GUIDE.tz).password, "new-placeholder", actor.tz);
  }
  // A guide with a stored users.passwords grant (ignored) and no reset right.
  const stray = { ...HELPER_USER, permissionGrants: ["users.passwords"] };
  const { users } = await call("putU", stray, {
    params: { tz: PW_GUIDE.tz }, body: { password: "new-placeholder" },
  }, pwSeed(stray));
  assert.equal(stored(users, PW_GUIDE.tz).password, "enc:old-placeholder");
});

// One's own password changes only through POST /api/auth/change-password
// (current password required); putU drops it from a self edit.
test("putU: a self edit cannot change one's own password", async () => {
  const before = PW_GUIDE.password;
  const { res: out, users } = await call("putU", PW_GUIDE, {
    params: { tz: PW_GUIDE.tz }, body: { password: "new-placeholder" },
  }, pwSeed(PW_GUIDE));
  assert.equal(out.statusCode, 200);
  assert.notEqual(stored(users, PW_GUIDE.tz).password, "new-placeholder");
  assert.equal(stored(users, PW_GUIDE.tz).password, before);
  assert.equal(stored(users, PW_GUIDE.tz).passwordChangedAt, undefined);
});

// 2. One person, one record: tz is unique across rooms, ignoring leading zeros.
// Synthetic checksum-valid ID: "012345674" and "12345674" are the same person.
const PADDED_TZ = "012345674";
const SHORT_TZ = "12345674";

test("postU refuses a tz already in any room, ignoring leading zeros (409)", async () => {
  const cases = [
    { room: "noActive", existing: NEW_TZ, posted: NEW_TZ },
    { room: "waiting", existing: SHORT_TZ, posted: PADDED_TZ },
    { room: "noActive", existing: PADDED_TZ, posted: SHORT_TZ },
    { room: "active", existing: SHORT_TZ, posted: PADDED_TZ },
  ];
  for (const { room, existing, posted } of cases) {
    const users = createUsers({ active: [SYS, ADMIN_USER] });
    users.rooms[room].push({ _id: "x1", tz: existing });
    const before = JSON.stringify(users.rooms);
    const { res: out } = await call("postU", ADMIN_USER, { body: { tz: posted, password: "placeholder" } }, users);
    assert.equal(out.statusCode, 409, `${room} ${existing} vs ${posted}`);
    assert.equal(JSON.stringify(users.rooms), before, "nothing written");
  }
});

test("register refuses a tz already in any room, ignoring leading zeros", async () => {
  const cases = [
    { room: "noActive", existing: NEW_TZ, posted: NEW_TZ },
    { room: "active", existing: SHORT_TZ, posted: PADDED_TZ },
    { room: "waiting", existing: PADDED_TZ, posted: SHORT_TZ },
    { room: "noActive", existing: SHORT_TZ, posted: PADDED_TZ },
  ];
  for (const { room, existing, posted } of cases) {
    const users = createUsers({ [room]: [{ _id: "x1", tz: existing }] });
    const before = JSON.stringify(users.rooms);
    const { controller } = loadController(users);
    const out = res();
    await controller.register({ body: { tz: posted, password: "placeholder" } }, out);
    assert.equal(out.statusCode, 400, `${room} ${existing} vs ${posted}`);
    assert.equal(JSON.stringify(users.rooms), before, "nothing written");
  }
});

test("register of a tz that differs from every stored one still lands in the waiting room", async () => {
  const users = createUsers({ active: [{ _id: "x1", tz: NEW_TZ }] });
  const { controller } = loadController(users);
  const out = res();
  await controller.register({ body: { tz: PADDED_TZ, password: "placeholder" } }, out);
  assert.equal(out.statusCode, 200);
  assert.ok(stored(users, PADDED_TZ, "waiting"));
});

test("changeRoom refuses (409) when the tz already exists in the destination room", async () => {
  const dupe = { _id: "d1", tz: GUIDE_USER.tz, firstname: "Dup", roles: [GUIDE], role: GUIDE };
  const users = createUsers({ ...seed(), noActive: [dupe] });
  const before = JSON.stringify(users.rooms);
  const { res: out } = await call("changeRoom", ADMIN_USER, {
    params: { tz: GUIDE_USER.tz }, body: { from: "active", to: "noActive" },
  }, users);
  assert.equal(out.statusCode, 409);
  assert.equal(JSON.stringify(users.rooms), before, "nothing moved");
});

test("changeRoom compares the destination tz ignoring leading zeros", async () => {
  const waiting = { _id: "w9", tz: PADDED_TZ, firstname: "Pad", roles: [], role: null };
  const users = createUsers({ active: [...seed().active, { _id: "x9", tz: SHORT_TZ }], waiting: [waiting] });
  const before = JSON.stringify(users.rooms);
  const { res: out } = await call("changeRoom", MANAGER, {
    params: { tz: PADDED_TZ }, body: { from: "waiting", to: "active", role: GUIDE },
  }, users);
  assert.equal(out.statusCode, 409);
  assert.equal(JSON.stringify(users.rooms), before, "nothing moved");
});

// 3. putU addressed by _id updates the real record and creates nothing.
test("putU by _id updates the stored user and creates no new record", async () => {
  const users = createUsers(seed());
  const count = users.rooms.active.length;
  const { res: out } = await call("putU", ADMIN_USER, { params: { tz: GUIDE_USER._id }, body: { firstname: "ById" } }, users);
  assert.equal(out.statusCode, 200);
  assert.equal(stored(users, GUIDE_USER.tz).firstname, "ById");
  assert.equal(users.rooms.active.length, count);
  assert.equal(users.rooms.active.filter((u) => u.tz === GUIDE_USER._id).length, 0);
});

// 4. Photos of other users need canManageTarget; the system account is missing.
const fileStub = () => ({
  "../UploadFile/file": {
    handleUpload: async () => ({ secure_url: "https://example.invalid/new.jpg" }),
    handleDeleteByUrl: async () => {},
  },
});
const photoExtra = { file: { buffer: Buffer.from("x"), originalname: "p.jpg", mimetype: "image/jpeg" } };

for (const handler of ["uploadPhoto", "deletePhoto"]) {
  test(`${handler}: another user's photo needs canManageTarget; the system account is 404`, async () => {
    const withPhoto = () => createUsers({ active: seed().active.map((u) => ({ ...u, photo: "https://example.invalid/old.jpg" })) });

    const peer = await call(handler, ADMIN_USER, { params: { tz: ADMIN_2.tz }, ...photoExtra }, withPhoto(), fileStub());
    assert.equal(peer.res.statusCode, 403);
    assert.equal(stored(peer.users, ADMIN_2.tz).photo, "https://example.invalid/old.jpg");

    const sys = await call(handler, ADMIN_USER, { params: { tz: SYSTEM_TZ }, ...photoExtra }, withPhoto(), fileStub());
    assert.equal(sys.res.statusCode, 404);
    assert.equal(stored(sys.users, SYSTEM_TZ).photo, "https://example.invalid/old.jpg");

    const lower = await call(handler, ADMIN_USER, { params: { tz: GUIDE_USER.tz }, ...photoExtra }, withPhoto(), fileStub());
    assert.equal(lower.res.statusCode, 200);

    const self = await call(handler, ADMIN_2, { params: { tz: ADMIN_2.tz }, ...photoExtra }, withPhoto(), fileStub());
    assert.equal(self.res.statusCode, 200);
  });
}

/* ================= smart-assistant alert hooks ================= */

// Records every alertEvents call; `fail` makes each one throw.
function alertSpy({ fail = false } = {}) {
  const calls = [];
  const record = (name) => async (...args) => {
    calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
    if (fail) throw new Error("alerts down");
  };
  const stub = {};
  for (const name of ["userWaiting", "accountLocked", "accessChanged", "systemLoginFailures", "parentRegistered", "vehicleStage"]) {
    stub[name] = record(name);
  }
  return { calls, deps: { "../../services/alertEvents": stub } };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("register raises user_waiting for the new waiting user", async () => {
  const spy = alertSpy();
  const { controller } = loadController(createUsers(), spy.deps);
  const out = res();
  await controller.register({ body: { tz: NEW_TZ, password: "placeholder", firstname: "New", lastname: "User" } }, out);
  await flush();
  assert.equal(out.statusCode, 200);
  assert.equal(spy.calls.length, 1);
  assert.equal(spy.calls[0].name, "userWaiting");
  assert.equal(spy.calls[0].args[0].tz, NEW_TZ);
  assert.equal(spy.calls[0].args[0].password, undefined, "the password never reaches the alert");
});

test("the automatic lock raises account_locked once; a failing alert does not change the answer", async () => {
  for (const fail of [false, true]) {
    const spy = alertSpy({ fail });
    const users = createUsers({ active: [{ ...GUIDE_USER, password: "enc:right", failedLoginCount: 4, lockedAt: null }] });
    const { controller } = loadController(users, spy.deps);
    const out = res();
    await controller.login({ body: { tz: GUIDE_USER.tz, password: "wrong" }, headers: {}, cookies: {}, ip: "127.0.0.1" }, out);
    await flush();
    assert.equal(out.statusCode, 401);
    assert.deepEqual(spy.calls.map((c) => c.name), ["accountLocked"]);
    assert.equal(spy.calls[0].args[0].tz, GUIDE_USER.tz);
    assert.ok(stored(users, GUIDE_USER.tz).lockedAt, "the lock itself is kept");
  }
});

test("every fifth failure on the system account raises system_login_failures", async () => {
  const spy = alertSpy();
  const users = createUsers({ active: [{ ...SYS, password: "enc:right", failedLoginCount: 4, lockedAt: null }] });
  const { controller } = loadController(users, spy.deps);
  await controller.login({ body: { tz: SYSTEM_TZ, password: "wrong" }, headers: {}, cookies: {} }, res());
  await flush();
  assert.deepEqual(spy.calls.map((c) => c.name), ["systemLoginFailures"]);
  assert.equal(spy.calls[0].args[0], 5);
  await controller.login({ body: { tz: SYSTEM_TZ, password: "wrong" }, headers: {}, cookies: {} }, res());
  await flush();
  assert.equal(spy.calls.length, 1, "the sixth failure raises nothing");
});

test("PUT permissions and PUT role raise access_changed for the target", async () => {
  const spy = alertSpy();
  await call("putPermissions", IT_USER, { params: { tz: GUIDE_USER.tz }, body: { grants: ["vehicles.view", "vehicles.edit"], revokes: [] } },
    createUsers(seed()), spy.deps);
  await call("putRole", MANAGER, { params: { tz: GUIDE_USER.tz }, body: { role: HELPER } }, createUsers(seed()), spy.deps);
  await flush();
  assert.deepEqual(spy.calls.map((c) => [c.name, c.args[0].tz, c.args[1].change]),
    [["accessChanged", GUIDE_USER.tz, "permissions"], ["accessChanged", GUIDE_USER.tz, "role"]]);
});

test("a refused permission change raises nothing", async () => {
  const spy = alertSpy();
  await call("putPermissions", GUIDE_USER, { params: { tz: HELPER_USER.tz }, body: { grants: [], revokes: [] } }, createUsers(seed()), spy.deps);
  await flush();
  assert.equal(spy.calls.length, 0);
});

test("putU stamps updatedAt, announces the change, and refuses a stale baseVersion with 409 without secrets", async () => {
  const users = createUsers(seed());
  const target = stored(users, GUIDE_USER.tz);
  target.updatedAt = new Date("2026-10-25T10:00:00.000Z");
  target.password = "stored-secret";
  live.changes.length = 0;

  const stale = await call("putU", ADMIN_USER, { params: { tz: GUIDE_USER.tz }, body: { firstname: "Late", baseVersion: "2026-10-25T09:00:00.000Z" } }, users);
  assert.equal(stale.res.statusCode, 409);
  assert.equal(stale.body.code, "STALE");
  assert.equal(stale.body.current.tz, GUIDE_USER.tz);
  assert.ok(!JSON.stringify(stale.body).includes("stored-secret"), "the current item never carries the password");
  assert.equal(stored(users, GUIDE_USER.tz).firstname, GUIDE_USER.firstname);
  assert.deepEqual(live.changes, []);

  const ok = await call("putU", ADMIN_USER, { params: { tz: GUIDE_USER.tz }, body: { firstname: "Fresh", baseVersion: "2026-10-25T10:00:00.000Z" } }, users);
  assert.equal(ok.res.statusCode, 200);
  assert.ok(new Date(stored(users, GUIDE_USER.tz).updatedAt).getTime() > Date.parse("2026-10-25T10:00:00.000Z"));
  assert.deepEqual(live.changes, [["user", GUIDE_USER._id]]);
});

/* ================= Administrators with IT's switch on (owner, 2026-11-04) ================= */
const { setAdminPowers } = require("../utils/permissionRules");
const withPowers = (name, fn) => test(name, async () => {
  setAdminPowers(true);
  try { await fn(); } finally { setAdminPowers(false); }
});
const NEW_STAFF = { tz: NEW_TZ, password: "placeholder", firstname: "New", lastname: "Staff", phone: "0500000000" };

withPowers("postU: an administrator adds an administrator, who must change the password", async () => {
  const { res: out, users } = await call("postU", ADMIN_USER, { body: { ...NEW_STAFF, role: ADMIN } });
  assert.equal(out.statusCode, 201);
  const saved = stored(users, NEW_TZ);
  assert.equal(saved.role, ADMIN);
  assert.equal(saved.mustChangePassword, true);
});

withPowers("postU: a missing name, phone or role is 400 MISSING_FIELDS, and email is optional", async () => {
  for (const missing of ["firstname", "lastname", "phone", "role"]) {
    const body = { ...NEW_STAFF, role: GUIDE };
    delete body[missing];
    const { res: out, body: answer, users } = await call("postU", ADMIN_USER, { body });
    assert.equal(out.statusCode, 400, missing);
    assert.equal(answer.code, "MISSING_FIELDS");
    assert.equal(stored(users, NEW_TZ), undefined);
  }
  const { res: out } = await call("postU", ADMIN_USER, { body: { ...NEW_STAFF, role: GUIDE, email: "" } });
  assert.equal(out.statusCode, 201);
});

withPowers("changeRoom: an administrator approves a waiting user as an administrator", async () => {
  const users = createUsers({ ...seed(), waiting: [{ _id: "w1", tz: NEW_TZ, firstname: "W", lastname: "Aiting" }] });
  const { res: out } = await call("changeRoom", ADMIN_USER, {
    params: { tz: NEW_TZ }, body: { from: "waiting", to: "active", role: ADMIN },
  }, users);
  assert.equal(out.statusCode, 200);
  assert.equal(stored(users, NEW_TZ).role, ADMIN);
});

withPowers("a rejected request is deleted, and the same person may register again", async () => {
  const users = createUsers({ ...seed(), waiting: [{ _id: "w1", tz: NEW_TZ, firstname: "W", lastname: "Aiting" }] });
  const { res: out } = await call("deleteU", ADMIN_USER, { params: { tz: NEW_TZ, from: "waiting" } }, users);
  assert.equal(out.statusCode, 200);
  assert.equal(stored(users, NEW_TZ, "waiting"), undefined);
  const again = await call("register", ADMIN_USER, { body: { ...NEW_STAFF } }, users);
  assert.equal(again.res.statusCode, 200);
  assert.ok(stored(users, NEW_TZ, "waiting"));
});

withPowers("permissions: an administrator reads and changes those below him, not his peers", async () => {
  const read = await call("getPermissions", ADMIN_USER, { params: { tz: GUIDE_USER.tz } });
  assert.ok(read.body.grantable.includes("students.edit"));
  assert.ok(read.body.grantable.includes("sports.coach"));
  assert.ok(!read.body.grantable.includes("audit.view"));
  const saved = await call("putPermissions", ADMIN_USER, {
    params: { tz: GUIDE_USER.tz }, body: { grants: ["vehicles.view", "students.edit"], revokes: ["ai.use"] },
  });
  assert.equal(saved.res.statusCode, 200);
  const peer = await call("putPermissions", ADMIN_USER, { params: { tz: ADMIN_2.tz }, body: { grants: ["students.edit"] } });
  assert.equal(peer.res.statusCode, 403);
  const it = await call("getPermissions", ADMIN_USER, { params: { tz: ADMIN_2.tz } });
  assert.equal(it.res.statusCode, 403);
});

/* ================= Alerts about staff (owner, 2026-11-04) ================= */
const alertsCalls = () => {
  const calls = [];
  const adminAdded = async (user) => { calls.push(user.tz); return { created: [] }; };
  return { calls, adminAdded };
};
const withAlerts = (alerts) => {
  const { noopAlertDeps } = require("./helpers/alertEventsStub");
  const key = Object.keys(noopAlertDeps).find((k) => k.endsWith("alertEvents"));
  return { [key]: { ...noopAlertDeps[key], adminAdded: alerts.adminAdded } };
};

const settle = () => new Promise((resolve) => setImmediate(resolve));

withPowers("adding an administrator alerts IT; adding a guide does not", async () => {
  const alerts = alertsCalls();
  await call("postU", ADMIN_USER, { body: { ...NEW_STAFF, role: GUIDE } }, createUsers(seed()), withAlerts(alerts));
  await settle();
  assert.deepEqual(alerts.calls, []);
  await call("postU", ADMIN_USER, { body: { ...NEW_STAFF, role: ADMIN } }, createUsers(seed()), withAlerts(alerts));
  await settle();
  assert.deepEqual(alerts.calls, [NEW_TZ]);
});

withPowers("approving or promoting to ادارة alerts IT", async () => {
  const alerts = alertsCalls();
  const users = createUsers({ ...seed(), waiting: [{ _id: "w1", tz: NEW_TZ, firstname: "W", lastname: "A" }] });
  await call("changeRoom", ADMIN_USER, { params: { tz: NEW_TZ }, body: { from: "waiting", to: "active", role: ADMIN } }, users, withAlerts(alerts));
  await call("putRole", ADMIN_USER, { params: { tz: GUIDE_USER.tz }, body: { role: ADMIN } }, createUsers(seed()), withAlerts(alerts));
  await settle();
  assert.deepEqual(alerts.calls, [NEW_TZ, GUIDE_USER.tz]);
});

test("PUT /:tz never stores receivesRequestAlerts; the IT route does", async () => {
  const everyday = await call("putU", ADMIN_USER, { params: { tz: GUIDE_USER.tz }, body: { firstname: "X", receivesRequestAlerts: true } });
  assert.equal(stored(everyday.users, GUIDE_USER.tz).receivesRequestAlerts, undefined);
  const { res: out, users } = await call("putRequestAlerts", IT_USER, { params: { tz: ADMIN_USER.tz }, body: { enabled: true } });
  assert.equal(out.statusCode, 200);
  assert.equal(stored(users, ADMIN_USER.tz).receivesRequestAlerts, true);
  const bad = await call("putRequestAlerts", IT_USER, { params: { tz: ADMIN_USER.tz }, body: { enabled: "x" } });
  assert.equal(bad.res.statusCode, 400);
});

/* ================= Hidden IT users (owner, 2026-11-04) ================= */
const HIDDEN_IT = { _id: "x1", tz: "100000009", firstname: "Real", lastname: "Person", isIT: true };
const withHidden = () => createUsers({ active: [...seed().active, HIDDEN_IT] });

test("an administrator never finds a hidden IT user", async () => {
  const users = withHidden();
  const list = await call("getAllU", ADMIN_USER, { query: {} }, users);
  assert.ok(!JSON.stringify(list.body).includes(HIDDEN_IT.tz));
  for (const [handler, extra] of [
    ["getOneU", { params: { tz: HIDDEN_IT.tz } }],
    ["putU", { params: { tz: HIDDEN_IT.tz }, body: { firstname: "X" } }],
    ["deleteU", { params: { tz: HIDDEN_IT.tz, from: "active" } }],
    ["putRole", { params: { tz: HIDDEN_IT.tz }, body: { role: GUIDE } }],
    ["getPermissions", { params: { tz: HIDDEN_IT.tz } }],
    ["changeRoom", { params: { tz: HIDDEN_IT.tz }, body: { from: "active", to: "noActive" } }],
  ]) {
    const { res: out } = await call(handler, ADMIN_USER, extra, users);
    assert.equal(out.statusCode, 404, handler);
  }
  assert.ok(stored(users, HIDDEN_IT.tz));
});

test("the IT site still finds him, and he finds himself", async () => {
  const users = withHidden();
  const it = await call("getOneU", IT_USER, { params: { tz: HIDDEN_IT.tz } }, users);
  assert.equal(it.res.statusCode, 200);
  const self = await call("getOneU", HIDDEN_IT, { user: { tz: HIDDEN_IT.tz }, actor: { id: "x1", tz: HIDDEN_IT.tz, isSystem: true, hidden: true, permissions: new Set(["users.view"]), user: HIDDEN_IT }, params: { tz: HIDDEN_IT.tz } }, users);
  assert.equal(self.res.statusCode, 200);
});

/* ================= The email code in System's sign-in (owner, 2026-11-04) ================= */
const codeStub = (result = {}) => {
  const calls = { sent: [], checked: [] };
  return {
    calls,
    deps: { "./SystemCode.auth": { systemCode: () => ({
      send: async (user) => { calls.sent.push(user.tz); return result.send || "sent"; },
      check: async (tz, code) => { calls.checked.push([tz, code]); return result.check || "ok"; },
      ticketFor: (tz) => `ticket-${tz}`,
      ticketOk: (tz, ticket) => ticket === `ticket-${tz}`,
    }) } },
  };
};
const IT_NO_ROLE = { ...HIDDEN_IT, password: "enc:right", email: "it@example.com" };
const signInDeps = {
  "../../utils/jwt": { signAccessToken: () => "access", signRefreshToken: () => "refresh", computeAccessExpMsFromNow: () => 1 },
};

test("a wrong password answers the same for an IT user and anyone else, and sends no code", async () => {
  const stub = codeStub();
  const users = createUsers({ active: [IT_NO_ROLE, { ...GUIDE_USER, password: "enc:right" }] });
  const it = await call("login", ADMIN_USER, { body: { tz: IT_NO_ROLE.tz, password: "wrong" } }, users, stub.deps);
  const guide = await call("login", ADMIN_USER, { body: { tz: GUIDE_USER.tz, password: "wrong" } }, users, stub.deps);
  assert.equal(it.res.statusCode, guide.res.statusCode);
  assert.deepEqual(it.body, guide.body);
  assert.deepEqual(stub.calls.sent, []);
});

test("the right password of a hidden IT user asks for the code, with no session", async () => {
  const stub = codeStub();
  const users = createUsers({ active: [IT_NO_ROLE] });
  const { res: out, body } = await call("login", ADMIN_USER, { body: { tz: IT_NO_ROLE.tz, password: "right" } }, users, stub.deps);
  assert.equal(out.statusCode, 200);
  assert.deepEqual(body, { ok: true, codeRequired: true, tz: IT_NO_ROLE.tz, ticket: `ticket-${IT_NO_ROLE.tz}` });
  assert.deepEqual(stub.calls.sent, [IT_NO_ROLE.tz]);
});

test("no real email: told to use a passkey, no session and no lock", async () => {
  const stub = codeStub({ send: "NO_EMAIL" });
  const users = createUsers({ active: [IT_NO_ROLE] });
  const { res: out, body } = await call("login", ADMIN_USER, { body: { tz: IT_NO_ROLE.tz, password: "right" } }, users, stub.deps);
  assert.equal(out.statusCode, 403);
  assert.equal(body.code, "USE_PASSKEY");
  assert.ok(body.message);
  assert.ok(!stored(users, IT_NO_ROLE.tz).lockedAt);
});

test("a blocked IT user with no role is refused only after the right password", async () => {
  const stub = codeStub();
  const users = createUsers({ active: [{ ...IT_NO_ROLE, itBlockedAt: new Date() }] });
  const wrong = await call("login", ADMIN_USER, { body: { tz: IT_NO_ROLE.tz, password: "wrong" } }, users, stub.deps);
  assert.equal(wrong.body.code, "INVALID_CREDENTIALS");
  const right = await call("login", ADMIN_USER, { body: { tz: IT_NO_ROLE.tz, password: "right" } }, users, stub.deps);
  assert.equal(right.res.statusCode, 403);
  assert.equal(right.body.code, "IT_BLOCKED");
  assert.deepEqual(stub.calls.sent, []);
});

test("the system account also needs the code; a forced password change comes first", async () => {
  const stub = codeStub();
  const sys = { ...SYS, password: "enc:right", passwordChangedAt: new Date() };
  const asked = await call("login", ADMIN_USER, { body: { tz: SYSTEM_TZ, password: "right" } }, createUsers({ active: [sys] }), stub.deps);
  assert.equal(asked.body.codeRequired, true);
  stub.calls.sent.length = 0;
  const forced = await call("login", ADMIN_USER, { body: { tz: IT_NO_ROLE.tz, password: "right" } },
    createUsers({ active: [{ ...IT_NO_ROLE, mustChangePassword: true }] }), { ...stub.deps, ...signInDeps });
  assert.equal(forced.body.mustChangePassword, true);
  assert.deepEqual(stub.calls.sent, []);
});

test("an ordinary user never gets a code step", async () => {
  const stub = codeStub();
  const users = createUsers({ active: [{ ...GUIDE_USER, password: "enc:right" }] });
  const { body } = await call("login", ADMIN_USER, { body: { tz: GUIDE_USER.tz, password: "right" } }, users, { ...stub.deps, ...signInDeps });
  assert.notEqual(body.codeRequired, true);
  assert.deepEqual(stub.calls.sent, []);
});

test("login-code: a bad or wrong code is refused, a wrong one counts as a failed sign-in", async () => {
  const users = createUsers({ active: [IT_NO_ROLE] });
  const bad = await call("loginWithCode", ADMIN_USER, { body: { tz: IT_NO_ROLE.tz, code: "1", ticket: `ticket-${IT_NO_ROLE.tz}` } }, users, codeStub({ check: "bad" }).deps);
  assert.equal(bad.res.statusCode, 400);
  assert.equal(bad.body.code, "BAD_CODE");
  const wrong = await call("loginWithCode", ADMIN_USER, { body: { tz: IT_NO_ROLE.tz, code: "000000", ticket: `ticket-${IT_NO_ROLE.tz}` } }, users, codeStub({ check: "wrong" }).deps);
  assert.equal(wrong.res.statusCode, 400);
  assert.equal(stored(users, IT_NO_ROLE.tz).failedLoginCount, 1);
});

test("login-code refuses an account that has since been blocked or locked", async () => {
  const stub = codeStub();
  const blocked = await call("loginWithCode", ADMIN_USER, { body: { tz: IT_NO_ROLE.tz, code: "123456", ticket: `ticket-${IT_NO_ROLE.tz}` } },
    createUsers({ active: [{ ...IT_NO_ROLE, itBlockedAt: new Date() }] }), stub.deps);
  assert.equal(blocked.res.statusCode, 400);
  const locked = await call("loginWithCode", ADMIN_USER, { body: { tz: IT_NO_ROLE.tz, code: "123456", ticket: `ticket-${IT_NO_ROLE.tz}` } },
    createUsers({ active: [{ ...IT_NO_ROLE, lockedAt: new Date() }] }), stub.deps);
  assert.equal(locked.res.statusCode, 400);
});

/* ================= From the review (2026-11-04) ================= */
test("a forced password change ends without a session for a hidden IT user, who then needs the code", async () => {
  const users = createUsers({ active: [{ ...IT_NO_ROLE, mustChangePassword: true }] });
  const actor = { id: "x1", tz: IT_NO_ROLE.tz, name: "Real Person", isSystem: true, hidden: true, permissions: new Set(), user: users.rooms.active[0] };
  const { res: out, body } = await call("changePassword", IT_NO_ROLE, {
    user: { tz: IT_NO_ROLE.tz, scope: "password-change" }, actor, body: { currentPassword: "right", newPassword: "another-pass-1" },
  }, users, signInDeps);
  assert.equal(out.statusCode, 200);
  assert.deepEqual(body, { ok: true, signInAgain: true });
  assert.equal(stored(users, IT_NO_ROLE.tz).mustChangePassword, false);
});

test("forgot-password on an account with no real email answers like any other and sends nothing", async () => {
  let sent = 0;
  const email = { sendResetPasswordEmail: async () => { sent += 1; throw new Error("No recipients defined"); } };
  for (const address of ["", "test@test.com"]) {
    const users = createUsers({ active: [{ ...GUIDE_USER, email: address }] });
    const { res: out, body } = await call("forgotPassword", ADMIN_USER, { body: { tz: GUIDE_USER.tz } }, users, { "../../utils/sendEmail": email });
    assert.equal(out.statusCode, 200);
    assert.equal(body.ok, true);
  }
  assert.equal(sent, 0);
});

test("login-code answers a locked hidden user like anyone else, so it reveals nothing", async () => {
  const stub = codeStub();
  const hidden = await call("loginWithCode", ADMIN_USER, { body: { tz: IT_NO_ROLE.tz, code: "123456", ticket: `ticket-${IT_NO_ROLE.tz}` } },
    createUsers({ active: [{ ...IT_NO_ROLE, lockedAt: new Date() }] }), stub.deps);
  const ordinary = await call("loginWithCode", ADMIN_USER, { body: { tz: GUIDE_USER.tz, code: "123456" } },
    createUsers({ active: [{ ...GUIDE_USER, lockedAt: new Date() }] }), stub.deps);
  assert.equal(hidden.res.statusCode, ordinary.res.statusCode);
  assert.deepEqual(hidden.body, ordinary.body);
});

test("a new IT user with no role gets no storage folder; a password reset and sign-out end System passkeys", async () => {
  let folders = 0;
  const storage = { "../Storage/Storage.controller": {
    buildUserStorageFolder: (u = {}) => `users/${u.tz}`,
    ensureUserStorageFolder: async () => { folders += 1; },
    syncStorageViewPermissionsForUser: async () => {},
  } };
  await call("createItUser", IT_USER, { body: { tz: NEW_TZ, firstname: "N", lastname: "S", email: "n@example.com" } }, createUsers(seed()), storage);
  assert.equal(folders, 0);

  const users = createUsers({ active: [...seed().active, { ...GUIDE_USER, _id: "g9", tz: "guide-9", systemPasskeys: [{ id: "c" }] }] });
  await call("signOutEverywhere", ADMIN_USER, { params: { tz: "guide-9" } }, users);
  assert.deepEqual(stored(users, "guide-9").systemPasskeys, []);
  const reset = createUsers({ active: [...seed().active, { ...GUIDE_USER, _id: "g9", tz: "guide-9", systemPasskeys: [{ id: "c" }] }] });
  await call("resetUserPassword", ADMIN_USER, { params: { tz: "guide-9" }, body: { password: "new-pass-123" } }, reset);
  assert.deepEqual(stored(reset, "guide-9").systemPasskeys, []);
});

/* ================= The items left open (2026-11-04) ================= */
test("login-code without the password step's ticket checks nothing and counts nothing", async () => {
  const stub = codeStub({ check: "wrong" });
  const users = createUsers({ active: [IT_NO_ROLE] });
  for (const ticket of [undefined, "forged", "ticket-100000017"]) {
    const { res: out, body } = await call("loginWithCode", ADMIN_USER, { body: { tz: IT_NO_ROLE.tz, code: "000000", ticket } }, users, stub.deps);
    assert.equal(out.statusCode, 400);
    assert.equal(body.code, "BAD_CODE");
  }
  assert.deepEqual(stub.calls.checked, []);
  assert.ok(!stored(users, IT_NO_ROLE.tz).failedLoginCount);
});

withPowers("an administrator cannot read the permissions of another administrator or an IT user", async () => {
  const peer = await call("getPermissions", ADMIN_USER, { params: { tz: ADMIN_2.tz } });
  assert.equal(peer.res.statusCode, 403);
  assert.deepEqual(peer.body, FORBIDDEN);
  const itGuide = { ...GUIDE_USER, _id: "t9", tz: "it-9", isIT: true };
  const it = await call("getPermissions", ADMIN_USER, { params: { tz: itGuide.tz } }, createUsers({ active: [...seed().active, itGuide] }));
  assert.equal(it.res.statusCode, 403);
  const below = await call("getPermissions", ADMIN_USER, { params: { tz: GUIDE_USER.tz } });
  assert.equal(below.res.statusCode, 200);
});
