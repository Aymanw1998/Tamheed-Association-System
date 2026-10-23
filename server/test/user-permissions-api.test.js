// Permission and role endpoints, and the closing of every other way to write
// a role or a permission: putU, postU, register, changeRoom, deleteU, unlock,
// and the automatic lock in login.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { actorFor } = require("./helpers/actors");
const { auditStub } = require("./helpers/auditStub");

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
    return String(doc[k]) === String(want);
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

const actorOf = (user) => actorFor(user, { isSystem: user.tz === SYSTEM_TZ });
const req = (actorUser, extra = {}) => ({
  user: { tz: actorUser.tz }, actor: actorOf(actorUser), params: {}, query: {}, body: {}, ip: "127.0.0.1", ...extra,
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
  const { res: out, body } = await call("getPermissions", MANAGER, { params: { tz: GUIDE_USER.tz } });
  assert.equal(out.statusCode, 200);
  assert.equal(body.ok, true);
  assert.equal(body.role, GUIDE);
  assert.deepEqual(body.grants, ["vehicles.view"]);
  assert.deepEqual(body.revokes, ["ai.use"]);
  assert.ok(body.effective.includes("vehicles.view"));
  assert.ok(!body.effective.includes("ai.use"));
  assert.ok(body.defaults.includes("lessons.roster"));
  assert.ok(!body.defaults.includes("vehicles.view"));
  assert.ok(body.grantable.includes("vehicles.view"));
  assert.ok(!body.grantable.includes("users.passwords"), "dangerous keys are never grantable by a manager");
  assert.equal(body.updatedAt, null);
  assert.equal(body.updatedBy, null);
});

test("GET permissions answers grantable [] when the actor cannot change this target", async () => {
  const { res: out, body } = await call("getPermissions", MANAGER, { params: { tz: MANAGER_2.tz } });
  assert.equal(out.statusCode, 200);
  assert.deepEqual(body.grantable, []);
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
  const { res: out, body, users, audit } = await call("putPermissions", MANAGER, {
    params: { tz: GUIDE_USER.tz }, body: { grants: ["vehicles.view", "vehicles.edit"], revokes: [] },
  });
  assert.equal(out.statusCode, 200);
  assert.equal(body.ok, true);
  const saved = stored(users, GUIDE_USER.tz);
  assert.deepEqual(saved.permissionGrants, ["vehicles.view", "vehicles.edit"]);
  assert.deepEqual(saved.permissionRevokes, []);
  assert.ok(saved.permissionsUpdatedAt instanceof Date);
  assert.equal(saved.permissionsUpdatedBy, MANAGER.tz);
  const [row] = audit.find({ module: "users", action: "permission_change", targetId: GUIDE_USER.tz });
  assert.ok(row, "permission_change recorded");
  assert.deepEqual(row.before.permissionGrants, ["vehicles.view"]);
  assert.deepEqual(row.after.permissionGrants, ["vehicles.view", "vehicles.edit"]);
  assert.deepEqual(row.before.permissionRevokes, ["ai.use"]);
  assert.deepEqual(row.after.permissionRevokes, []);
});

test("PUT permissions refuses a dangerous key from a manager with 400 NOT_GRANTABLE", async () => {
  const { res: out, body, users } = await call("putPermissions", MANAGER, {
    params: { tz: GUIDE_USER.tz }, body: { grants: ["vehicles.view", "users.passwords"], revokes: [] },
  });
  assert.equal(out.statusCode, 400);
  assert.deepEqual(body, { ok: false, code: "NOT_GRANTABLE" });
  assert.deepEqual(stored(users, GUIDE_USER.tz).permissionGrants, ["vehicles.view"]);
});

test("PUT permissions refuses an unknown key with 400 UNKNOWN_KEY", async () => {
  const { res: out, body } = await call("putPermissions", MANAGER, {
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

test("PUT permissions without permissions.manage, or on an equal-rank target, is 403", async () => {
  const noKey = await call("putPermissions", ADMIN_USER, { params: { tz: GUIDE_USER.tz }, body: { grants: [] } });
  assert.equal(noKey.res.statusCode, 403);
  assert.deepEqual(noKey.body, FORBIDDEN);
  const peer = await call("putPermissions", MANAGER, { params: { tz: ADMIN_USER.tz }, body: { grants: [] } });
  assert.equal(peer.res.statusCode, 403);
  assert.deepEqual(peer.body, FORBIDDEN);
});

test("PUT permissions on the system account is 404", async () => {
  const { res: out, users } = await call("putPermissions", MANAGER, { params: { tz: SYSTEM_TZ }, body: { grants: ["ai"] } });
  assert.equal(out.statusCode, 404);
  assert.equal(stored(users, SYSTEM_TZ).permissionGrants, undefined);
});

test("the system account may grant a dangerous key; updatedBy never names its tz", async () => {
  const { res: out, users } = await call("putPermissions", SYS, {
    params: { tz: GUIDE_USER.tz }, body: { grants: ["users.passwords"], revokes: [] },
  });
  assert.equal(out.statusCode, 200);
  const saved = stored(users, GUIDE_USER.tz);
  assert.deepEqual(saved.permissionGrants, ["users.passwords"]);
  assert.equal(saved.permissionsUpdatedBy, "system");
});

test("PUT permissions validates only what changed: an existing grant the manager lacks survives a resubmit", async () => {
  // HELPER_USER holds sports.view (granted earlier); a manager cannot grant sports.
  const kept = await call("putPermissions", MANAGER, {
    params: { tz: HELPER_USER.tz }, body: { grants: ["sports.view", "vehicles.view"], revokes: [] },
  });
  assert.equal(kept.res.statusCode, 200);
  assert.deepEqual(stored(kept.users, HELPER_USER.tz).permissionGrants, ["sports.view", "vehicles.view"]);

  const removed = await call("putPermissions", MANAGER, {
    params: { tz: HELPER_USER.tz }, body: { grants: [], revokes: [] },
  });
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
  await call("putPermissions", MANAGER, { params: { tz: GUIDE_USER.tz }, body: { grants: [], revokes: [] } }, createUsers(seed()), capture);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(seen, [
    { tz: GUIDE_USER.tz, change: "role", actorTz: MANAGER.tz },
    { tz: GUIDE_USER.tz, change: "permissions", actorTz: MANAGER.tz },
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

test("PUT role without users.changeRole is 403", async () => {
  const { res: out, body, users } = await call("putRole", ADMIN_USER, {
    params: { tz: GUIDE_USER.tz }, body: { role: HELPER },
  });
  assert.equal(out.statusCode, 403);
  assert.deepEqual(body, FORBIDDEN);
  assert.equal(stored(users, GUIDE_USER.tz).role, GUIDE);
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
      refreshHash: "injected", resetOtpHash: "injected", resetOtpExpires: "2099-01-01",
      resetOtpAttempts: 0, resetOtpLockedUntil: "2000-01-01",
    },
  });
  assert.equal(out.statusCode, 200);
  const saved = stored(users, GUIDE_USER.tz);
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
    body: { tz: NEW_TZ, password: "placeholder", roles: [GUIDE] },
  });
  assert.equal(out.statusCode, 201);
  const saved = stored(users, NEW_TZ);
  assert.equal(saved.role, GUIDE);
  assert.deepEqual(saved.roles, [GUIDE]);
});

test("postU: a default admin may not create another admin (403)", async () => {
  const { res: out, users } = await call("postU", ADMIN_USER, {
    body: { tz: NEW_TZ, password: "placeholder", roles: [ADMIN] },
  });
  assert.equal(out.statusCode, 403);
  assert.equal(stored(users, NEW_TZ), undefined);
});

test("postU: a creator must hold every default leaf of the role he gives", async () => {
  const guideCreator = { ...GUIDE_USER, permissionGrants: ["users.create"] };
  const { res: out } = await call("postU", guideCreator, {
    body: { tz: NEW_TZ, password: "placeholder", roles: [HELPER] },
  }, createUsers({ active: [SYS, guideCreator] }));
  // GUIDE_USER has ai.use revoked, and ai.use is a helper default.
  assert.equal(out.statusCode, 403);
});

test("postU by a role manager stores the single role and no grants", async () => {
  const { res: out, users } = await call("postU", MANAGER, {
    body: { tz: NEW_TZ, password: "placeholder", role: GUIDE,
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
    body: { tz: NEW_TZ, password: "placeholder", role: "nonsense" },
  });
  assert.equal(out.statusCode, 400);
  assert.deepEqual(body, { ok: false, code: "UNKNOWN_ROLE" });
});

test("postU without a role creates a user with no role", async () => {
  const { res: out, users } = await call("postU", ADMIN_USER, { body: { tz: NEW_TZ, password: "placeholder" } });
  assert.equal(out.statusCode, 201);
  const saved = stored(users, NEW_TZ);
  assert.equal(saved.role, null);
  assert.deepEqual(saved.roles, []);
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
    tz: NEW_TZ, password: "placeholder", storageFolder: "someone-elses-folder", googleDrive: { refreshToken: "x" },
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
  const lacking = { ...ADMIN_USER, permissionRevokes: ["lessons.roster"] };
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

  const ok = await call("postU", ADMIN_USER, { body: { tz: ` ${NEW_TZ} `, password: "placeholder" } });
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
  const moved = await call("changeRoom", ADMIN_USER, {
    params: { tz: HELPER_USER.tz }, body: { from: "active", to: "waiting" },
  }, users);
  assert.equal(moved.res.statusCode, 200);
  const approved = await call("changeRoom", ADMIN_USER, {
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
  const { res: out, users } = await call("putPermissions", MANAGER, {
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
  await call("putPermissions", MANAGER, { params: { tz: HELPER_USER.tz }, body: { grants: ["sports.view", "vehicles.view"], revokes: ["ai.use"] } }, users);
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
    body: { tz: NEW_TZ, password: "placeholder", roles: [HELPER] },
  }, createUsers({ active: [SYS, guideCreator] }));
  assert.equal(out.statusCode, 201);
  assert.equal(stored(users, NEW_TZ).role, HELPER);
});

/* ================= Phase 4 final-review fixes ================= */

// 1. Passwords of other users: only the system or a users.passwords holder.
const PW_GUIDE = { ...GUIDE_USER, password: "enc:old-placeholder" };
const pwSeed = (actor) => createUsers({
  active: [SYS, actor, PW_GUIDE].filter((u, i, all) => all.findIndex((x) => x.tz === u.tz) === i),
});

test("putU: an admin without users.passwords cannot set another user's password; the rest applies", async () => {
  const { res: out, users } = await call("putU", ADMIN_USER, {
    params: { tz: PW_GUIDE.tz }, body: { firstname: "Renamed", password: "new-placeholder" },
  }, pwSeed(ADMIN_USER));
  assert.equal(out.statusCode, 200);
  const saved = stored(users, PW_GUIDE.tz);
  assert.equal(saved.password, "enc:old-placeholder");
  assert.equal(saved.firstname, "Renamed");
});

test("putU: a users.passwords holder, and the system, may set another user's password", async () => {
  const pwAdmin = { ...ADMIN_USER, permissionGrants: ["users.passwords"] };
  for (const actor of [pwAdmin, SYS]) {
    const { res: out, users } = await call("putU", actor, {
      params: { tz: PW_GUIDE.tz }, body: { password: "new-placeholder" },
    }, pwSeed(actor));
    assert.equal(out.statusCode, 200, actor.tz);
    assert.equal(stored(users, PW_GUIDE.tz).password, "new-placeholder", actor.tz);
  }
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
  await call("putPermissions", MANAGER, { params: { tz: GUIDE_USER.tz }, body: { grants: ["vehicles.view", "vehicles.edit"], revokes: [] } },
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
