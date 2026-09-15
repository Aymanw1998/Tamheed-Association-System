const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

// Load the real handler with inert dependencies: importing the application
// normally initializes database, storage, email, and logging integrations.
function loadController() {
  const updates = [];
  const dependencies = {
    bcryptjs: {},
    jsonwebtoken: {},
    path,
    "./User.model": {
      UserModelDef: {
        async update(filter, data, room) {
          updates.push({ filter, data, room });
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
  return { putU: module.exports.putU, updates };
}

async function updateUser({ user, body, tz = "self-user" }) {
  const { putU, updates } = loadController();
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  await putU({ params: { tz }, user, body }, res);
  // Convert objects created in the VM into this test's realm for strict equality.
  return { res, updates: JSON.parse(JSON.stringify(updates)) };
}

test("self-edit saves profile fields while ignoring authority and session metadata", async () => {
  const profile = {
    firstname: "Example",
    lastname: "User",
    birth_date: "2000-01-02",
    gender: "ذكر",
    phone: "+10000000000",
    email: "profile@example.test",
    city: "Example City",
    street: "Example Street",
    password: "new-profile-password",
    photo: "/example-profile.png",
  };
  const { res, updates } = await updateUser({
    user: { tz: "self-user", roles: ["مرشد"] },
    body: {
      ...profile,
      tz: "another-user",
      roles: ["ادارة"],
      main_lesson: "another-lesson",
      storageFolder: "another-users-folder",
      storagePermissions: { view: ["*"], create: ["*"], update: ["*"], delete: ["*"] },
      googleDrive: { refreshToken: "injected-token" },
      refreshHash: "injected-hash",
      resetOtpHash: "injected-otp",
      resetOtpExpires: "2099-01-01",
      resetOtpAttempts: 0,
      resetOtpLockedUntil: "2000-01-01",
      room: "waiting",
      futurePrivilegedField: true,
    },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(updates, [{
    filter: { tz: "self-user" },
    data: { ...profile, birth_date: "2000-01-02T00:00:00.000Z" },
    room: "active",
  }]);
});

test("missing roles cannot turn a request-body admin role into authorization", async () => {
  const { res, updates } = await updateUser({
    user: { tz: "self-user" },
    body: { firstname: "Updated", roles: ["ادارة"], room: "noActive" },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(updates, [{
    filter: { tz: "self-user" }, data: { firstname: "Updated" }, room: "active",
  }]);
});

for (const role of ["ادارة", " إدارة ", "الادارة", "الإدارة", "Ø§Ø¯Ø§Ø±Ø©"]) {
  test(`administrator ${JSON.stringify(role)} retains user-management fields and room selection`, async () => {
    const body = {
      tz: "renamed-user",
      firstname: "Updated",
      roles: ["مساعد"],
      storageFolder: "assigned-folder",
      storagePermissions: { view: ["assigned-folder"] },
      main_lesson: "assigned-lesson",
      room: "waiting",
    };
    const { res, updates } = await updateUser({
      user: { tz: "admin-user", roles: [role] }, body,
    });
    assert.equal(res.statusCode, 200);
    const { room, ...data } = body;
    assert.deepEqual(updates, [{ filter: { tz: "self-user" }, data, room }]);
  });
}

test("administrator can manage their own account through the route's self branch", async () => {
  const { res, updates } = await updateUser({
    user: { tz: "self-user", roles: ["Ø§Ø¯Ø§Ø±Ø©"] },
    body: { roles: ["ادارة", "مرشد"] },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(updates[0].data, { roles: ["ادارة", "مرشد"] });
});

test("non-administrators cannot update another identity even if the handler is called directly", async () => {
  for (const user of [undefined, { tz: "other-user", roles: ["مساعد"] }]) {
    const { res, updates } = await updateUser({ user, body: { firstname: "Changed" } });
    assert.equal(res.statusCode, 403);
    assert.deepEqual(updates, []);
  }
});

test("a partial profile save does not erase omitted or empty fields", async () => {
  const { res, updates } = await updateUser({
    user: { tz: "self-user", roles: [] },
    body: { firstname: "Updated", password: "", email: null, photo: null },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(updates[0].data, { firstname: "Updated" });
});
