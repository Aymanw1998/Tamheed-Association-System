// Exercise the actual service with fake OAuth/Drive/database dependencies.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const FULL = "https://www.googleapis.com/auth/drive";
function fixture() {
  const connection = { refreshToken: "synthetic-refresh", rootFolderId: "synthetic-root" };
  const authRequests = [], events = [], uploads = [], shares = [];
  let active = 0, maxActive = 0, failOnce = false;
  let parentPermissions = [{ type: "user", role: "owner" }];
  class OAuth2 {
    generateAuthUrl(options) { authRequests.push(options); return "https://accounts.google.test/consent"; }
    setCredentials() {}
    async getToken() { return { tokens: { refresh_token: "synthetic-new-refresh", scope: `${FULL} https://www.googleapis.com/auth/userinfo.email` } }; }
  }
  const deps = {
    googleapis: { google: { auth: { OAuth2 }, drive: () => ({ files: { get: async () => ({ data: { permissions: parentPermissions } }), create: async (options) => { uploads.push(options); return { data: { id: "synthetic-file", name: "file" } }; } }, permissions: { create: async (options) => { shares.push(options); } } }), oauth2: () => ({ userinfo: { get: async () => ({ data: { email: "synthetic@example.test" } }) } }) } },
    stream: require("node:stream"),
    "../Entities/api": { read: async () => ({ result: [connection] }), update: async ({ newData }) => { Object.assign(connection, newData); return { success: true }; } },
    "./driveLayout": { createDriveLayout: () => ({
      migrate: async ({ apply = false }) => ({ applied: apply }),
      async resolve(folder) {
        active++; maxActive = Math.max(maxActive, active); events.push(`start:${folder}`);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active--; events.push(`end:${folder}`);
        if (failOnce) { failOnce = false; throw new Error("transient"); }
        return "folder-id";
      },
    }) },
  };
  const module = { exports: {} }, filename = path.join(__dirname, "../services/googleDrive.service.js");
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), { module, require: (name) => {
    assert.ok(Object.hasOwn(deps, name), `Unexpected dependency ${name}`); return deps[name];
  }, process: { env: { GOOGLE_CLIENT_ID: "synthetic-client", GOOGLE_CLIENT_SECRET: "synthetic-secret" } } }, { filename });
  return { service: module.exports, connection, authRequests, events, uploads, shares, setParentPermissions: (value) => { parentPermissions = value; }, max: () => maxActive, fail: () => { failOnce = true; } };
}
test("normal reconnect remains narrow; manual-file opt-in requests the full Drive scope", () => {
  const f = fixture();
  f.service.getAuthUrl("state"); f.service.getAuthUrl("state", { fullAccess: true });
  assert.ok(f.authRequests[0].scope.includes("https://www.googleapis.com/auth/drive.file"));
  assert.ok(!f.authRequests[0].scope.includes(FULL));
  assert.ok(f.authRequests[1].scope.includes(FULL));
  assert.equal(f.authRequests[1].state, "state");
});
test("connection status reports the requested root and actual recorded scopes without exposing tokens", async () => {
  const f = fixture();
  assert.equal((await f.service.getStatus()).rootName, "Tamheed-System");
  assert.equal((await f.service.getStatus()).manualFilesAccess, false);
  await f.service.handleOAuthCallback("synthetic-code");
  const status = await f.service.getStatus();
  assert.equal(status.manualFilesAccess, true);
  assert.equal(status.refreshToken, undefined);
  assert.equal(f.connection.rootFolderId, null, "a changed Google account is resolved again");
});
test("migration preview refuses a narrow grant that could hide conflicting manually created folders", async () => {
  const f = fixture();
  await assert.rejects(() => f.service.reorganizeLayout(), { code: "DRIVE_LAYOUT_SCOPE" });
  assert.deepEqual(f.events, []);
  await f.service.handleOAuthCallback("synthetic-code");
  assert.equal((await f.service.reorganizeLayout()).applied, false);
});
test("concurrent uploads serialize folder creation and recover the queue after a failure", async () => {
  const f = fixture();
  await Promise.all([f.service.ensureFolderPath("one"), f.service.ensureFolderPath("two")]);
  assert.equal(f.max(), 1);
  assert.deepEqual(f.events, ["start:one", "end:one", "start:two", "end:two"]);
  f.fail();
  await assert.rejects(() => f.service.ensureFolderPath("broken"), /transient/);
  assert.equal((await f.service.ensureFolderPath("recovered")).parentId, "folder-id");
});
test("private association uploads accept streams without public shares; profile-photo uploads keep their existing public image behavior", async () => {
  const f = fixture(), body = require("node:stream").Readable.from([Buffer.from("synthetic")]);
  await f.service.uploadPrivateFile({ body, name: "file.pdf", folderPath: "tamheed_db/root" });
  assert.equal(f.uploads[0].media.body, body);
  assert.equal(f.shares.length, 0);
  await f.service.uploadFile({ buffer: Buffer.from("synthetic"), name: "photo.png", folderPath: "tamheed_db/Students" });
  assert.equal(f.shares.length, 1);
  assert.equal(f.shares[0].requestBody.type, "anyone");
});
test("private uploads refuse inherited public access or unknown parent permissions before creating a file", async () => {
  const f = fixture();
  for (const permissions of [[{ type: "anyone", role: "reader" }], [{ type: "domain", role: "reader" }], undefined]) {
    f.setParentPermissions(permissions);
    await assert.rejects(() => f.service.uploadPrivateFile({ buffer: Buffer.from("synthetic"), name: "private.pdf", folderPath: "Storages" }), { code: "DRIVE_PUBLIC_PARENT" });
  }
  assert.equal(f.uploads.length, 0);
  assert.equal(f.shares.length, 0);
});
