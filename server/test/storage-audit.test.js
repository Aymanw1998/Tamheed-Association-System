// File changes reach the central audit log: folder create, upload, rename
// (file and folder), delete, share and unshare. The central storage server,
// the database and the live bus are in-memory stand-ins.
const assert = require("node:assert/strict");
const test = require("node:test");
const { actorFor } = require("./helpers/actors");
const { loadStorageController, ADMIN, OTHER } = require("./helpers/storageController");

const setup = (seed, options) => loadStorageController(seed, options);

const req = (body = {}) => ({ user: { tz: ADMIN.tz, roles: ADMIN.roles }, actor: actorFor(ADMIN), body, params: {}, query: {} });
const createRes = () => ({ statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });

test("creating a folder and uploading a file are recorded", async () => {
  const { controller, audit } = setup();
  const folder = createRes();
  await controller.createFolder(req({ name: "Trips", path: "" }), folder);
  assert.equal(folder.statusCode, 201);
  const [made] = audit.find({ module: "files", action: "create", targetId: "Trips" });
  assert.ok(made, "folder create recorded");
  assert.equal(made.targetType, "folder");
  assert.equal(made.targetLabel, "Trips");

  const upload = createRes();
  await controller.mergeChunks(req({ uploadId: "u1", fileName: "plan.pdf", totalChunks: 1, path: "Trips" }), upload);
  assert.equal(upload.statusCode, 201);
  const [uploaded] = audit.find({ module: "files", action: "upload" });
  assert.ok(uploaded, "upload recorded");
  assert.equal(uploaded.targetType, "file");
  assert.equal(uploaded.targetLabel, "plan.pdf");
});

test("renaming a file and a folder records the old and new names", async () => {
  const { controller, audit } = setup([
    { type: "file", name: "old.pdf", relativePath: "tamheed_db/root/Trips/old.pdf", ownerId: ADMIN._id },
    { type: "folder", name: "Trips", relativePath: "tamheed_db/root/Trips", ownerId: ADMIN._id },
  ]);
  const renamed = createRes();
  await controller.renameFile(req({ relativePath: "Trips/old.pdf", newName: "new.pdf" }), renamed);
  assert.equal(renamed.statusCode, 200);
  const [file] = audit.find({ module: "files", action: "rename", targetId: "Trips/old.pdf" });
  assert.ok(file, "file rename recorded");
  assert.equal(file.targetType, "file");
  assert.equal(file.before.name, "old.pdf");
  assert.equal(file.after.name, "new.pdf");
  const { diffChanges } = require("../utils/audit");
  assert.deepEqual(diffChanges(file.before, file.after).name, { before: "old.pdf", after: "new.pdf" });

  await controller.renameFile(req({ relativePath: "Trips", newName: "Outings", isDirectory: true }), createRes());
  const [folder] = audit.find({ module: "files", action: "rename", targetId: "Trips" });
  assert.equal(folder.targetType, "folder");
  assert.equal(folder.before.name, "Trips");
  assert.equal(folder.after.name, "Outings");
});

test("deleting, sharing and unsharing are recorded", async () => {
  const { controller, audit } = setup([
    { type: "file", name: "a.pdf", relativePath: "tamheed_db/root/docs/a.pdf", ownerId: ADMIN._id, sharedWith: [] },
  ]);
  const shared = createRes();
  await controller.shareEntry(req({ relativePath: "docs/a.pdf", targetTz: OTHER.tz, role: "read" }), shared);
  assert.equal(shared.statusCode, 200);
  const [share] = audit.find({ module: "files", action: "share", targetId: "docs/a.pdf" });
  assert.ok(share, "share recorded");
  assert.equal(share.after.sharedWithUser, "Oth Er");

  await controller.unshareEntry(req({ relativePath: "docs/a.pdf", targetTz: OTHER.tz }), createRes());
  assert.equal(audit.find({ module: "files", action: "unshare", targetId: "docs/a.pdf" }).length, 1);

  const removed = createRes();
  await controller.deleteEntry(req({ relativePath: "docs/a.pdf" }), removed);
  assert.equal(removed.statusCode, 200);
  const [deleted] = audit.find({ module: "files", action: "delete", targetId: "docs/a.pdf" });
  assert.ok(deleted, "delete recorded");
  assert.equal(deleted.before.name, "a.pdf");
  assert.equal(deleted.after, null);

  // A refused request records nothing.
  const count = audit.calls.length;
  await controller.shareEntry(req({ relativePath: "docs/a.pdf" }), createRes());
  assert.equal(audit.calls.length, count);
});

/* ================= the system account ================= */

// A synthetic, checksum-valid ID number (not a real person).
const SYSTEM_TZ = "000000026";
const SYS = { _id: "e".repeat(24), tz: SYSTEM_TZ, firstname: "Sys", lastname: "Tem", roles: [] };

async function withSystemTz(fn) {
  const had = Object.hasOwn(process.env, "SYSTEM_ADMIN_TZ");
  const previous = process.env.SYSTEM_ADMIN_TZ;
  process.env.SYSTEM_ADMIN_TZ = SYSTEM_TZ;
  try { return await fn(); } finally { if (had) process.env.SYSTEM_ADMIN_TZ = previous; else delete process.env.SYSTEM_ADMIN_TZ; }
}

test("sharing with or unsharing from the system account is 404 and writes nothing", async () => {
  await withSystemTz(async () => {
    const seed = [{ type: "file", name: "a.pdf", relativePath: "tamheed_db/root/docs/a.pdf", ownerId: ADMIN._id, sharedWith: [] }];
    const { controller, storage, audit, published } = setup(seed, { extraUsers: [SYS] });
    for (const handler of ["shareEntry", "unshareEntry"]) {
      const out = createRes();
      await controller[handler](req({ relativePath: "docs/a.pdf", targetTz: SYSTEM_TZ, role: "read" }), out);
      assert.equal(out.statusCode, 404, handler);
      assert.equal(out.body.message, "Target user not found");
      assert.ok(!JSON.stringify(out.body).includes(SYSTEM_TZ));
    }
    assert.deepEqual(JSON.parse(JSON.stringify(storage.all()[0].sharedWith)), []);
    assert.equal(audit.calls.length, 0);
    assert.equal(published.length, 0);
  });
});

test("share status never lists the system account", async () => {
  await withSystemTz(async () => {
    // The view scope resolves this path without the storage root prefix.
    const seed = [{ type: "file", name: "a.pdf", relativePath: "docs/a.pdf", ownerId: ADMIN._id,
      sharedWith: [{ userId: SYS._id, role: "read" }, { userId: OTHER._id, role: "read" }] }];
    const { controller } = setup(seed, { extraUsers: [SYS] });
    const out = createRes();
    await controller.getShareStatus({ ...req(), query: { relativePath: "docs/a.pdf" } }, out);
    assert.equal(out.statusCode, 200);
    const listed = JSON.parse(JSON.stringify(out.body.sharedWith));
    assert.deepEqual(listed.map((u) => u.tz), [OTHER.tz]);
  });
});
