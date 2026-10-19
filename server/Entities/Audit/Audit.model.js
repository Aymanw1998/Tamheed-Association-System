const api = require("../api");

// Append-only history of who changed what. Shape:
//   at (Date), actor ("system"|tz), actorName, module, action, targetType,
//   targetId, targetLabel, changes ({ field: { before, after } }), ip
const dbName = process.env.DB_NAME || "tamheed_db";

const AuditModelDef = { dbName, collection: "AuditLog" };
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

module.exports = { AuditModelDef };
