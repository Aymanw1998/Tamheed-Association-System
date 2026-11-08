const api = require("../api");

// Append-only history of who changed what. Shape:
//   at (Date), actor ("system"|tz), actorName, module, action, targetType,
//   targetId, targetLabel, changes ({ field: { before, after } }), ip,
//   via ("assistant" when the user approved it in the assistant; absent otherwise)
const dbName = process.env.DB_NAME || "tamheed_db";

const AuditModelDef = { dbName, collection: "AuditLog" };
// Only archive metadata changes; the original evidence is never rewritten.
AuditModelDef.archive = async function (ids, archived, actor) {
  return api.updateMany({ dbName: this.dbName, collection: this.collection,
    filter: { _id: { $in: ids } }, newData: { archivedAt: archived ? new Date() : null, archivedBy: archived ? actor : null } });
};
AuditModelDef.create = async function (data) {
  return await api.create({ dbName: this.dbName, collection: this.collection, data });
};
// Newest first; returns { items, total } for the 1-based `page`.
AuditModelDef.page = async function (filter = {}, { page = 1, pageSize = 50 } = {}) {
  const res = await api.readPage({
    dbName: this.dbName,
    collection: this.collection,
    filter,
    sort: { at: -1, _id: -1 },
    skip: (page - 1) * pageSize,
    limit: pageSize,
  });
  return { items: res.result, total: res.total };
};

// An archived row is deleted this long after it was archived (owner,
// 2026-11-08): the TTL index on archivedAt. Current rows (archivedAt null)
// are never deleted; restoring a row clears archivedAt and so keeps it.
const ARCHIVE_KEEP_DAYS = 183;
const ARCHIVE_KEEP_SECONDS = ARCHIVE_KEEP_DAYS * 24 * 60 * 60;

// api.js never creates indexes. The list is newest first and the edit pages
// ask for one target's rows. `collection` is injectable for tests.
const AUDIT_INDEXES = [{ at: -1 }, { targetId: 1, at: -1 }];
const AUDIT_TTL_INDEX = { key: { archivedAt: 1 }, options: { expireAfterSeconds: ARCHIVE_KEEP_SECONDS } };
async function ensureAuditIndexes(collection) {
  const target = collection || require("mongoose").connection
    .useDb(dbName, { useCache: true })
    .collection(AuditModelDef.collection);
  for (const spec of AUDIT_INDEXES) await target.createIndex(spec);
  await target.createIndex(AUDIT_TTL_INDEX.key, AUDIT_TTL_INDEX.options);
}

module.exports = { AuditModelDef, AUDIT_INDEXES, AUDIT_TTL_INDEX, ARCHIVE_KEEP_DAYS, ensureAuditIndexes };
