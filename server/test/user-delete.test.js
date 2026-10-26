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
function loadController() {
  const deletes = [];
  const dependencies = {
    bcryptjs: {},
    jsonwebtoken: {},
    path,
    "./User.model": {
      UserModelDef: {
        async get(filter) {
          const hit = filter.tz === TARGET.tz;
          return { success: true, count: hit ? 1 : 0, result: hit ? [TARGET] : [] };
        },
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
  return { deleteU: module.exports.deleteU, deletes };
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
