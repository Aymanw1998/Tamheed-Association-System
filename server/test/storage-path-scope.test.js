const assert = require("node:assert/strict");
const test = require("node:test");
const { actorFor } = require("./helpers/actors");
const { loadStorageController, ADMIN, OTHER } = require("./helpers/storageController");
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } });

test("dot segments cannot escape personal folders or expose sibling profile/vehicle branches", async () => {
  for (const user of [ADMIN, OTHER]) {
    for (const path of ["../", "../../", "users/me/../../../Vehicles", "..\\..\\Profile-photos", "a/./b"]) {
      const { controller, calls } = loadStorageController();
      const req = { user: { tz: user.tz }, actor: actorFor(user), query: { path }, params: {}, body: {} };
      const res = response();
      await controller.listStorage(req, res);
      assert.equal(res.statusCode, 400, `${user.tz}: ${path}`);
      assert.equal(calls.length, 0, "invalid paths never reach storage");
    }
  }
});
test("folder creation rejects dot names before they are normalized into a parent path", async () => {
  const { controller, calls } = loadStorageController();
  for (const name of [".", ".."]) {
    const res = response();
    await controller.createFolder({ user: { tz: OTHER.tz }, actor: actorFor(OTHER), query: {}, params: {}, body: { name } }, res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(calls.length, 0);
});
