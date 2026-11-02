// After signing in, a user's shared-file permissions are rebuilt from the
// shares the storage server still has. A share is dropped only when the
// storage server answers that the file is gone, never because it was slow
// or unreachable (owner, 2026-11-02: storage calls now have a time limit).
const assert = require("node:assert/strict");
const test = require("node:test");
const { loadStorageController, OTHER } = require("./helpers/storageController");

const shared = { type: "file", name: "plan.pdf", relativePath: "Trips/plan.pdf", sharedWith: [{ userId: OTHER.tz, role: "read" }] };
const sharedRows = (storage) => storage.all().filter((d) => d.relativePath === shared.relativePath);

test("a storage server that does not answer keeps the share", async () => {
  const { controller, storage } = loadStorageController([shared], {
    axiosGet: async () => { throw Object.assign(new Error("timeout of 10000ms exceeded"), { code: "ECONNABORTED" }); },
  });
  await controller.syncStorageViewPermissionsForUser(OTHER);
  assert.equal(sharedRows(storage).length, 1);
});

test("a file the storage server no longer lists loses its share", async () => {
  const { controller, storage } = loadStorageController([shared], { axiosGet: async () => ({ data: { items: [] } }) });
  await controller.syncStorageViewPermissionsForUser(OTHER);
  assert.equal(sharedRows(storage).length, 0);
});

test("the folder and list calls have a time limit", async () => {
  const { controller, calls } = loadStorageController([shared]);
  await controller.syncStorageViewPermissionsForUser(OTHER);
  await controller.ensureUserStorageFolder(OTHER);
  const list = calls.find(([kind, url]) => kind === "get" && url.endsWith("/list"));
  assert.ok(list?.[2]?.timeout > 0);
  const folder = calls.find(([kind, url]) => kind === "post" && url.endsWith("/folder"));
  assert.ok(folder?.[3]?.timeout > 0);
});
