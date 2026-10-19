// File changes reach the central audit log: folder create, upload, rename
// (file and folder), delete, share and unshare. The central storage server,
// the database and SSE are in-memory stand-ins.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { actorFor } = require("./helpers/actors");
const { auditStub } = require("./helpers/auditStub");

function createStore(seed = []) {
  let docs = seed.map((d, i) => ({ _id: `meta-${i}`, ...d }));
  let next = docs.length;
  const matches = (doc, filter = {}) => Object.keys(filter).every((k) => String(doc[k]) === String(filter[k]));
  return {
    async get(filter = {}) { return { success: true, result: docs.filter((d) => matches(d, filter)).map((d) => structuredClone(d)) }; },
    async create(data) { const doc = { _id: `meta-${next++}`, ...structuredClone(data) }; docs.push(doc); return { success: true, result: doc }; },
    async update(filter, patch) { docs = docs.map((d) => (matches(d, filter) ? { ...d, ...structuredClone(patch) } : d)); return { success: true }; },
    async delete(filter) { docs = docs.filter((d) => !matches(d, filter)); return { success: true }; },
    all: () => docs,
  };
}

const ADMIN = { _id: "a".repeat(24), tz: "100000009", firstname: "Ad", lastname: "Min", roles: ["ادارة"] };
const OTHER = { _id: "b".repeat(24), tz: "200000008", firstname: "Oth", lastname: "Er", roles: ["مرشد"] };

function setup(seed = []) {
  const storage = createStore(seed);
  const users = { async get(filter = {}) { return { success: true, result: [ADMIN, OTHER].filter((u) => !filter.tz || u.tz === filter.tz).filter((u) => !filter._id || u._id === filter._id) }; }, async update() { return { success: true }; } };
  const calls = [];
  const axios = {
    async post(url, body) { calls.push(["post", url, body]); return { data: { success: true, filename: body?.fileName, relativePath: "" } }; },
    async patch(url, body) { calls.push(["patch", url, body]); return { data: { success: true, name: body.newName } }; },
    async delete(url, options) { calls.push(["delete", url, options]); return { data: { success: true, deleted: true } }; },
  };
  const audit = auditStub();
  const dependencies = {
    axios,
    "form-data": function FormData() {},
    fs: { mkdirSync() {}, promises: { readFile: async () => { throw Object.assign(new Error("none"), { code: "ENOENT" }); }, mkdir: async () => {}, writeFile: async () => {}, unlink: async () => {}, readdir: async () => [], stat: async () => ({}) } },
    jsonwebtoken: { sign: () => "token", verify: () => ({}) },
    path,
    "../User/User.model": { UserModelDef: users },
    "./Storage.model": { StorageModelDef: storage },
    "../../utils/sse": { broadcast() {} },
    "../../utils/textEncoding": require("../utils/textEncoding"),
    "../../utils/permissions": require("../utils/permissions"),
    "../../utils/permissionRules": require("../utils/permissionRules"),
    "../../utils/israeliId": require("../utils/israeliId"),
    ...audit.deps,
  };
  const filename = path.join(__dirname, "../Entities/Storage/Storage.controller.js");
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), {
    module, URL, Date, Buffer, setTimeout, setInterval: () => ({ unref() {} }),
    process: { env: {}, cwd: () => __dirname },
    console: { log() {}, info() {}, warn() {}, error() {} },
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  }, { filename });
  return { controller: module.exports, storage, audit, calls };
}

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
