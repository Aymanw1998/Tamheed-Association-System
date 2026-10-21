const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { auditStub } = require("./helpers/auditStub");
const { actorFor } = require("./helpers/actors");

// Load the real handler with inert dependencies: importing the application
// normally initializes database, storage, email, and logging integrations.
const STORED_TARGET = { tz: "self-user", role: "مساعد", roles: ["مساعد"] };

function loadController() {
  const updates = [];
  const dependencies = {
    bcryptjs: {},
    jsonwebtoken: {},
    path,
    "./User.model": {
      UserModelDef: {
        // The edited user, as stored, in whichever room is asked for.
        async get(filter) {
          const hit = filter.tz === STORED_TARGET.tz;
          return { success: true, count: hit ? 1 : 0, result: hit ? [STORED_TARGET] : [] };
        },
        async update(filter, data, room) {
          updates.push({ filter, data, room });
          return { success: true };
        },
      },
    },
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
  // The route runs loadActor first; req.actor is built from the same user.
  await putU({ params: { tz }, user, actor: user && actorFor(user), body }, res);
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
      vehiclePermissions: ["view", "edit", "compliance", "documents", "archive"],
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
  // One's own password changes only through POST /api/auth/change-password.
  const { password, ...profileWithoutPassword } = profile;
  assert.deepEqual(updates, [{
    filter: { tz: "self-user" },
    data: { ...profileWithoutPassword, birth_date: "2000-01-02T00:00:00.000Z" },
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
    const { room, roles, tz, storageFolder, ...data } = body;
    // Roles change only through PUT /:tz/role; tz and storageFolder never change through putU.
    assert.deepEqual(updates, [{ filter: { tz: "self-user" }, data, room }]);
  });
}

test("an administrator editing their own account is limited to profile fields", async () => {
  const { res, updates } = await updateUser({
    user: { tz: "self-user", roles: ["Ø§Ø¯Ø§Ø±Ø©"] },
    body: { firstname: "Updated", roles: ["ادارة", "مرشد"], main_lesson: "lesson", room: "waiting" },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(updates, [{ filter: { tz: "self-user" }, data: { firstname: "Updated" }, room: "active" }]);
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

test("tour progress fields in the body are ignored, for self and administrators", async () => {
  const tourFields = {
    tours: { welcome: { status: "done", version: 1 } },
    knownKeys: ["users.edit"],
    seenReleases: ["r1"],
  };
  for (const user of [
    { tz: "self-user", roles: ["مرشد"] },
    { tz: "admin-user", roles: ["ادارة"] },
  ]) {
    const { res, updates } = await updateUser({
      user, body: { firstname: "Updated", ...tourFields },
    });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(updates[0].data, { firstname: "Updated" });
  }
});
