// Physical Drive folders are independent of the legacy storage API paths.
// No database, credentials or Google client is loaded by this module.
const FOLDER = "application/vnd.google-apps.folder";
const fail = (code, message) => Object.assign(new Error(message), { code });
const parts = (value) => {
  const segments = String(value || "").split(/[\\/]/).filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === ".." || segment.includes("\0"))) throw fail("DRIVE_LAYOUT_PATH", "مسار المجلد غير صالح");
  return segments;
};
const quote = (value) => String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

function describePath(value, dbName, collection) {
  const path = parts(value);
  const aliases = [
    { physical: ["Storages"], legacy: [dbName, collection] },
    { physical: ["Profile-photos", "Students"], legacy: [dbName, "Students"] },
    { physical: ["Profile-photos", "Users"], legacy: [dbName, "Users"] },
  ];
  for (const alias of aliases) {
    for (const prefix of [alias.physical, alias.legacy]) {
      if (prefix.every((segment, i) => path[i] === segment)) return { ...alias, tail: path.slice(prefix.length) };
    }
  }
  return { physical: [], legacy: [], tail: path };
}

function createDriveLayout({ drive, getConnection, saveConnection, dbName = "tamheed_db", collection = "root", rootName = "Tamheed-System", legacyRootName = "Tamheed" }) {
  const call = (method, input) => drive.files[method](input, { timeout: 15000 });
  async function child(parent, name) {
    const { data } = await call("list", {
      q: `name = '${quote(name)}' and mimeType = '${FOLDER}' and trashed = false and '${quote(parent)}' in parents`,
      fields: "files(id, name)", spaces: "drive", pageSize: 2,
    });
    if (data.files?.length > 1) throw fail("DRIVE_LAYOUT_AMBIGUOUS", `يوجد أكثر من مجلد باسم ${name}. يلزم تحديد المجلد الصحيح قبل المتابعة.`);
    return data.files?.[0]?.id || null;
  }
  async function create(parent, name) {
    const { data } = await call("create", { requestBody: { name, mimeType: FOLDER, parents: [parent] }, fields: "id" });
    return data.id;
  }
  async function walk(rootId, segments, ensure = false) {
    let id = rootId;
    for (const segment of segments) {
      const found = await child(id, segment);
      if (!found && !ensure) return null;
      id = found || await create(id, segment);
    }
    return id;
  }
  async function root(ensure = false) {
    const connection = await getConnection();
    if (connection?.rootFolderId) return connection.rootFolderId;
    const current = await child("root", rootName);
    const old = rootName === legacyRootName ? current : await child("root", legacyRootName);
    if (current && old && current !== old) throw fail("DRIVE_LAYOUT_AMBIGUOUS", "يوجد مجلد قديم وجديد للجمعية. حدّد مجلد الحساب المرتبط قبل النقل.");
    const found = current || old;
    if (found) {
      if (ensure) await saveConnection({ rootFolderId: found });
      return found;
    }
    if (!ensure) return null;
    const id = await create("root", rootName);
    await saveConnection({ rootFolderId: id });
    return id;
  }

  async function resolve(folderPath, ensure = false) {
    const rootId = await root(ensure);
    if (!rootId) return null;
    const path = describePath(folderPath, dbName, collection);
    let base = rootId;
    if (path.physical.length) {
      const canonical = await walk(rootId, path.physical);
      const legacy = await walk(rootId, path.legacy);
      if (canonical && legacy && canonical !== legacy) throw fail("DRIVE_LAYOUT_CONFLICT", "توجد ملفات في المسار القديم والجديد. يلزم حل التعارض قبل المتابعة.");
      base = canonical || legacy;
      if (!base) {
        if (!ensure) return null;
        base = await walk(rootId, path.physical, true);
      }
    }
    return walk(base, path.tail, ensure);
  }

  // Preview is strictly read-only. Apply is an explicit operator action.
  // Move folders with stable ids rather than recreating/copying their files.
  async function migrate({ apply = false } = {}) {
    let rootId = await root(false);
    const plan = { rootName, existingRoot: Boolean(rootId), moves: [], create: [], cleanup: [], applied: false };
    if (!rootId) {
      plan.create = [rootName, "Profile-photos/Students", "Profile-photos/Users", "Storages", "Vehicles"];
      if (apply) {
        rootId = await root(true);
        for (const folder of plan.create.slice(1)) await walk(rootId, parts(folder), true);
        plan.applied = true;
      }
      return plan;
    }
    const { data: rootInfo } = await call("get", { fileId: rootId, fields: "id,name,mimeType,trashed,parents,permissions(role,type)" });
    if (rootInfo.trashed || rootInfo.mimeType !== FOLDER) throw fail("DRIVE_LAYOUT_ROOT", "مجلد الجمعية المرتبط غير متاح.");
    // A top-level destination with the same name must never be silently merged.
    const named = await child("root", rootName);
    if (named && named !== rootId) throw fail("DRIVE_LAYOUT_CONFLICT", "مجلد Tamheed-System آخر موجود بالفعل. لم تُنقل الملفات.");
    plan.renameRoot = rootInfo.name !== rootName;
    const dbFolder = await walk(rootId, [dbName]);
    const profileFolder = await walk(rootId, ["Profile-photos"]);
    const mappings = [
      { from: [dbName, "Students"], to: ["Profile-photos", "Students"] },
      { from: [dbName, "Users"], to: ["Profile-photos", "Users"] },
      { from: [dbName, collection], to: ["Storages"] },
    ];
    for (const mapping of mappings) {
      const source = await walk(rootId, mapping.from);
      const target = await walk(rootId, mapping.to);
      if (source && target && source !== target) throw fail("DRIVE_LAYOUT_CONFLICT", `المساران ${mapping.from.join("/")} و${mapping.to.join("/")} موجودان. لم تُنقل الملفات.`);
      if (source && source !== target) plan.moves.push({ id: source, from: mapping.from.join("/"), to: mapping.to.join("/") });
      else if (!target) plan.create.push(mapping.to.join("/"));
    }
    if (!await walk(rootId, ["Vehicles"])) plan.create.push("Vehicles");
    // Moving beneath shared parents can change inherited access. Fail closed
    // until the operator has dealt with those shares separately.
    if (plan.moves.length || plan.create.length) {
      for (const id of new Set([rootId, dbFolder, profileFolder].filter(Boolean))) {
        const info = id === rootId ? rootInfo : (await call("get", { fileId: id, fields: "permissions(role,type)" })).data;
        if (!Array.isArray(info.permissions) || info.permissions.some((permission) => permission.role !== "owner")) {
          throw fail("DRIVE_LAYOUT_SHARED_PARENT", "أحد المجلدات الأب مشترَك. راجع الصلاحيات الموروثة قبل النقل؛ لم تُنقل الملفات.");
        }
      }
    }
    if (!apply) return plan;
    // Re-check each source/target immediately before mutation; a failed run is
    // resumable because every completed move keeps its original Drive id.
    for (const move of plan.moves) {
      const source = await walk(rootId, parts(move.from));
      const target = await walk(rootId, parts(move.to));
      if (source !== move.id || target) throw fail("DRIVE_LAYOUT_CHANGED", "تغيّرت المجلدات منذ المعاينة. أعد تشغيل المعاينة قبل النقل.");
      const destination = parts(move.to);
      const name = destination.pop();
      const parent = await walk(rootId, destination, true);
      const { data: sourceInfo } = await call("get", { fileId: source, fields: "parents" });
      await call("update", { fileId: source, addParents: parent, removeParents: (sourceInfo.parents || []).join(","), requestBody: { name }, fields: "id" });
    }
    for (const folder of plan.create) await walk(rootId, parts(folder), true);
    if (plan.renameRoot) await call("update", { fileId: rootId, requestBody: { name: rootName }, fields: "id" });
    // Trash only the now-empty legacy structural folder; never its contents.
    if (dbFolder) {
      const remaining = await call("list", { q: `'${quote(dbFolder)}' in parents and trashed = false`, fields: "files(id)", pageSize: 1 });
      if (!remaining.data.files?.length) {
        await call("update", { fileId: dbFolder, requestBody: { trashed: true }, fields: "id" });
        plan.cleanup.push(dbName);
      }
    }
    await saveConnection({ rootFolderId: rootId, layoutVersion: 2 });
    plan.applied = true;
    return plan;
  }
  return { resolve, migrate };
}

module.exports = { createDriveLayout, describePath };
