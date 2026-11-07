const test = require("node:test");
const assert = require("node:assert/strict");
const { createDriveLayout, describePath } = require("../services/driveLayout");
const FOLDER = "application/vnd.google-apps.folder";

function fixture(legacy = false) {
  const nodes = [], writes = [], connection = {};
  let next = 0;
  const add = (name, parent = "root", mimeType = FOLDER, id = `id${++next}`) => {
    nodes.push({ id, name, parents: [parent], mimeType, permissions: [{ role: "owner", type: "user" }] });
    return id;
  };
  const located = (path) => {
    let parent = "root";
    for (const name of path.split("/")) {
      const found = nodes.find((node) => !node.trashed && node.name === name && node.parents.includes(parent));
      if (!found) return null;
      parent = found.id;
    }
    return nodes.find((node) => node.id === parent);
  };
  if (legacy) {
    const root = add("Tamheed"); connection.rootFolderId = root;
    const db = add("tamheed_db", root);
    add("Students", db, FOLDER, "students-folder"); add("Users", db, FOLDER, "users-folder");
    const storage = add("root", db, FOLDER, "storage-folder");
    add("student.png", "students-folder", "image/png", "student-photo");
    add("user.png", "users-folder", "image/png", "user-photo");
    add("plan.pdf", storage, "application/pdf", "storage-file");
    const vehicles = add("Vehicles", root); add("licence.pdf", vehicles, "application/pdf", "vehicle-document");
  }
  const drive = { files: {
    async list({ q, pageSize = 1000 }) {
      const parent = q.match(/'([^']+)' in parents/)?.[1];
      const name = q.match(/name = '([^']+)'/)?.[1];
      const files = nodes.filter((node) => !node.trashed && (!parent || node.parents.includes(parent))
        && (!name || node.name === name) && (!q.includes("mimeType =") || node.mimeType === FOLDER));
      return { data: { files: structuredClone(files.slice(0, pageSize)) } };
    },
    async get({ fileId }) {
      const node = nodes.find((item) => item.id === fileId);
      if (!node) throw new Error("missing fake file");
      return { data: structuredClone(node) };
    },
    async create({ requestBody }) { writes.push(["create", structuredClone(requestBody)]); return { data: { id: add(requestBody.name, requestBody.parents[0], requestBody.mimeType) } }; },
    async update({ fileId, requestBody, addParents, removeParents }) {
      writes.push(["update", fileId]);
      const node = nodes.find((item) => item.id === fileId);
      if (removeParents) node.parents = node.parents.filter((id) => !removeParents.split(",").includes(id));
      if (addParents && !node.parents.includes(addParents)) node.parents.push(addParents);
      Object.assign(node, requestBody);
      return { data: structuredClone(node) };
    },
  } };
  const layout = createDriveLayout({ drive, getConnection: async () => connection, saveConnection: async (patch) => Object.assign(connection, patch) });
  return { nodes, writes, connection, drive, layout, add, located };
}

test("a new installation stores photos, association files and vehicles in the requested branches", async () => {
  const f = fixture();
  await f.layout.resolve("tamheed_db/Students", true);
  await f.layout.resolve("tamheed_db/Users", true);
  await f.layout.resolve("tamheed_db/root/users/person/docs", true);
  await f.layout.resolve("Vehicles/car", true);
  for (const path of ["Profile-photos/Students", "Profile-photos/Users", "Storages/users/person/docs", "Vehicles/car"]) assert.ok(f.located(`Tamheed-System/${path}`), path);
  assert.equal(f.located("Tamheed-System/tamheed_db"), null);
  assert.ok(f.connection.rootFolderId);
});

test("read-only lookup creates neither a root nor empty folders", async () => {
  const f = fixture();
  assert.equal(await f.layout.resolve("tamheed_db/root"), null);
  assert.deepEqual(f.writes, []);
});

test("new nested uploads stay in the legacy branch until migration, avoiding a split store", async () => {
  const f = fixture(true);
  const id = await f.layout.resolve("tamheed_db/root/new/subfolder", true);
  assert.equal(f.located("Tamheed/tamheed_db/root/new/subfolder").id, id);
  assert.equal(f.located("Tamheed/Storages"), null);
  assert.equal(await f.layout.resolve("Storages/new/subfolder"), id);
});

test("preview is read-only; apply preserves root, folder and every file id and its permissions", async () => {
  const f = fixture(true);
  const originalRoot = f.connection.rootFolderId;
  const permissions = f.nodes.filter((node) => node.mimeType !== FOLDER).map((node) => [node.id, structuredClone(node.permissions)]);
  const plan = await f.layout.migrate();
  assert.equal(plan.moves.length, 3);
  assert.equal(plan.renameRoot, true);
  assert.equal(plan.applied, false);
  assert.deepEqual(f.writes, []);
  const applied = await f.layout.migrate({ apply: true });
  assert.equal(applied.applied, true);
  assert.equal(f.located("Tamheed-System").id, originalRoot);
  assert.equal(f.located("Tamheed-System/Profile-photos/Students/student.png").id, "student-photo");
  assert.equal(f.located("Tamheed-System/Profile-photos/Users/user.png").id, "user-photo");
  assert.equal(f.located("Tamheed-System/Storages/plan.pdf").id, "storage-file");
  assert.equal(f.located("Tamheed-System/Vehicles/licence.pdf").id, "vehicle-document");
  for (const [id, before] of permissions) assert.deepEqual(f.nodes.find((node) => node.id === id).permissions, before);
  assert.equal(await f.layout.resolve("tamheed_db/root"), "storage-folder");
  assert.equal(await f.layout.resolve("tamheed_db/Students"), "students-folder");
  assert.equal(f.located("Tamheed-System/tamheed_db"), null, "only the empty structural folder is trashed");
  assert.equal(f.connection.layoutVersion, 2);
  const writesBefore = f.writes.length;
  assert.equal((await f.layout.migrate({ apply: true })).moves.length, 0);
  assert.equal(f.writes.length, writesBefore, "a repeat does not move or create anything");
});

test("destination conflict refuses reads, writes and migration without merging or deleting either tree", async () => {
  const f = fixture(true); f.add("Storages", f.connection.rootFolderId);
  for (const action of [() => f.layout.resolve("tamheed_db/root"), () => f.layout.resolve("tamheed_db/root/new", true), () => f.layout.migrate({ apply: true })]) {
    await assert.rejects(action, { code: "DRIVE_LAYOUT_CONFLICT" });
  }
  assert.deepEqual(f.writes, []);
  assert.ok(f.located("Tamheed/tamheed_db/root/plan.pdf"));
});

test("shared source or destination parents stop migration before inherited access could change", async () => {
  for (const shared of ["Tamheed", "Tamheed/tamheed_db"]) {
    const f = fixture(true); f.located(shared).permissions.push({ role: "reader", type: "anyone" });
    await assert.rejects(() => f.layout.migrate({ apply: true }), { code: "DRIVE_LAYOUT_SHARED_PARENT" });
    assert.deepEqual(f.writes, []);
  }
});

test("permission/API failures propagate, rather than being mistaken for an empty folder", async () => {
  const f = fixture(); f.drive.files.list = async () => { throw new Error("Drive unavailable"); };
  await assert.rejects(() => f.layout.resolve("Storages", true), /Drive unavailable/);
  assert.deepEqual(f.writes, []);
});

test("duplicate folder names or competing roots never select an arbitrary tree", async () => {
  const f = fixture(); f.add("Tamheed-System"); f.add("Tamheed-System");
  await assert.rejects(() => f.layout.resolve("Storages", true), { code: "DRIVE_LAYOUT_AMBIGUOUS" });
  assert.deepEqual(f.writes, []);
  const g = fixture(true); g.add("Tamheed-System");
  await assert.rejects(() => g.layout.migrate({ apply: true }), { code: "DRIVE_LAYOUT_CONFLICT" });
  assert.deepEqual(g.writes, []);
});

test("a partially completed move can be resumed without duplicate folders or changed file ids", async () => {
  const f = fixture(true), update = f.drive.files.update;
  let failOnce = true;
  f.drive.files.update = async (request) => {
    if (failOnce && request.fileId === "users-folder") { failOnce = false; throw new Error("temporary failure"); }
    return update(request);
  };
  await assert.rejects(() => f.layout.migrate({ apply: true }), /temporary failure/);
  assert.equal(await f.layout.resolve("tamheed_db/Students"), "students-folder");
  assert.equal(await f.layout.resolve("tamheed_db/Users"), "users-folder");
  await f.layout.migrate({ apply: true });
  assert.equal(f.located("Tamheed-System/Profile-photos/Users/user.png").id, "user-photo");
  assert.equal(f.nodes.filter((node) => node.id === "student-photo").length, 1);
});

test("initialization preview creates nothing; explicit apply initializes all requested empty folders", async () => {
  const f = fixture();
  const preview = await f.layout.migrate();
  assert.equal(preview.existingRoot, false); assert.deepEqual(f.writes, []);
  await f.layout.migrate({ apply: true });
  for (const name of ["Profile-photos/Students", "Profile-photos/Users", "Storages", "Vehicles"]) assert.ok(f.located(`Tamheed-System/${name}`));
});

test("legacy storage namespace maps only to Storages; profile/vehicle branches cannot enter that listing", () => {
  assert.deepEqual(describePath("tamheed_db/root", "tamheed_db", "root"), { physical: ["Storages"], legacy: ["tamheed_db", "root"], tail: [] });
  assert.deepEqual(describePath("tamheed_db/root/Profile-photos", "tamheed_db", "root").tail, ["Profile-photos"]);
  for (const path of ["tamheed_db/root/../Students", "Storages/../../Vehicles", "Storages\\..\\Profile-photos"]) assert.throws(() => describePath(path, "tamheed_db", "root"), { code: "DRIVE_LAYOUT_PATH" });
});
