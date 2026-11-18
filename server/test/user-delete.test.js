const assert = require("node:assert/strict");
const live = require("./helpers/liveStubs");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { auditStub } = require("./helpers/auditStub");
const { actorFor } = require("./helpers/actors");

// The target exists in every room; the actor (an administrator) outranks it.
const TARGET = { _id: "t1", tz: "990000069", role: "مساعد", roles: ["مساعد"] };
const ADMIN = { _id: "a1", tz: "admin-user", role: "ادارة", roles: ["ادارة"] };

// Load the real handler with inert dependencies (see user-profile-authorization.test.js).
function loadController({ present = [TARGET.tz] } = {}) {
  const deletes = [];
  const creates = [];
  const bin = require("./helpers/recycleBinStub").recycleBinStub();
  const dependencies = {
    bcryptjs: {},
    jsonwebtoken: {},
    path,
    "./User.model": {
      UserModelDef: {
        async get(filter) {
          const tzs = filter.tz && filter.tz.$regex ? present.filter((tz) => new RegExp(filter.tz.$regex).test(tz)) : [filter.tz];
          const hit = tzs.some((tz) => present.includes(tz));
          return { success: true, count: hit ? 1 : 0, result: hit ? [TARGET] : [] };
        },
        async create(data, room) { creates.push({ data, room }); return { success: true, result: data }; },
        async delete(filter, room) {
          deletes.push({ filter, room });
          return { success: true, result: { deletedCount: 1 } };
        },
      },
    },
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
    "./passwordCrypto": {},
    "../UploadFile/file": {},
    "../Storage/Storage.controller": {},
    "../Notification/Notification.controller": {},
    ...require("./helpers/alertEventsStub").noopAlertDeps,
    ...auditStub().deps,
    ...bin.deps,
  };
  const filename = path.join(__dirname, "../Entities/User/User.controller.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    require(name) {
      if (!Object.hasOwn(dependencies, name) && Object.hasOwn(live.deps, name)) return live.deps[name];
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return { deleteU: module.exports.deleteU, trashHooks: module.exports.trashHooks, deletes, creates, bin };
}

// Mirrors the route DELETE /user/:tz/:from, where the room is a path parameter.
async function deleteUser(params) {
  const { deleteU, deletes } = loadController();
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  await deleteU({ params, query: {}, body: {}, actor: actorFor(ADMIN) }, res);
  return { res, deletes: JSON.parse(JSON.stringify(deletes)) };
}

for (const room of ["waiting", "noActive", "active"]) {
  test(`deleting from the "${room}" room removes the user from that room`, async () => {
    const { res, deletes } = await deleteUser({ tz: "990000069", from: room });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(deletes, [{ filter: { tz: "990000069", updatedAt: null }, room }]);
  });
}

test("an unknown room is refused instead of falling back to active users", async () => {
  const { res, deletes } = await deleteUser({ tz: "990000069", from: "everyone" });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(deletes, []);
});

// Owner, 2026-11-02: a deleted user's alerts go with them.
test("deleting a user removes the alerts about them and their own inbox", async () => {
  const { forgotten } = require("./helpers/alertEventsStub");
  forgotten.length = 0;
  const { res } = await deleteUser({ tz: "990000069", from: "active" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(forgotten, [["user", "990000069"]]);
});

// The recycle bin (owner, 2026-11-16).
test("a deleted user goes to the recycle bin with its room, and comes back there signed out", async () => {
  const { deleteU, trashHooks, bin, creates } = loadController({ present: [TARGET.tz] });
  const res = { status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } };
  await deleteU({ params: { tz: TARGET.tz, from: "noActive" }, query: {}, body: {}, actor: actorFor(ADMIN) }, res);
  assert.equal(res.body.trashId, "trash-1");
  assert.equal(bin.puts[0].kind, "user");
  assert.equal(bin.puts[0].extras.room, "noActive");

  const back = loadController({ present: [] });
  const entry = { refId: "t1", data: { ...TARGET, refreshHashes: ["h"], refreshHash: "x" }, extras: { room: "noActive" } };
  assert.deepEqual({ ...(await back.trashHooks.restore(entry)) }, { ok: true });
  assert.equal(back.creates[0].room, "noActive");
  assert.equal(back.creates[0].data._id, "t1");
  assert.ok(!("refreshHashes" in back.creates[0].data) && !("refreshHash" in back.creates[0].data));

  const taken = await trashHooks.restore(entry);
  assert.equal(taken.ok, false);
  assert.equal(taken.status, 409);
});
