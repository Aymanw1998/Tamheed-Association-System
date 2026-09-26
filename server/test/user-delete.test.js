const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

// Load the real handler with inert dependencies (see user-profile-authorization.test.js).
function loadController() {
  const deletes = [];
  const dependencies = {
    bcryptjs: {},
    jsonwebtoken: {},
    path,
    "./User.model": {
      UserModelDef: {
        async delete(filter, room) {
          deletes.push({ filter, room });
          return { success: true };
        },
      },
    },
    "../../utils/sendEmail": {},
    "../../utils/jwt": {},
    "../../utils/textEncoding": require("../utils/textEncoding"),
    "../../middleware/logger": { logWithSource() {} },
    "./passwordCrypto": {},
    "../UploadFile/file": {},
    "../Storage/Storage.controller": {},
    "../Notification/Notification.controller": {},
  };
  const filename = path.join(__dirname, "../Entities/User/User.controller.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module,
    require(name) {
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
  await deleteU({ params, query: {}, body: {} }, res);
  return { res, deletes: JSON.parse(JSON.stringify(deletes)) };
}

for (const room of ["waiting", "noActive", "active"]) {
  test(`deleting from the "${room}" room removes the user from that room`, async () => {
    const { res, deletes } = await deleteUser({ tz: "990000069", from: room });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(deletes, [{ filter: { tz: "990000069" }, room }]);
  });
}

test("an unknown room is refused instead of falling back to active users", async () => {
  const { res, deletes } = await deleteUser({ tz: "990000069", from: "everyone" });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(deletes, []);
});
