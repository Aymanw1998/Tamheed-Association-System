const api = require("../api");

// The recycle bin (owner, 2026-11-16): a deleted student, vehicle or staff
// member is kept here 30 days, then deleted for good (services/recycleBinJob.js).
// The record leaves its own collection at once, so every list, search and
// count stays as it was; restoring puts it back with the same _id.
//
// Shape: kind ("student"|"vehicle"|"user"), refId (the record's _id), label,
//   data (the record as it was), extras (what went with it, per kind),
//   deletedAt (Date), deletedBy ({ tz, name }).
const KEEP_DAYS = 30;
const KINDS = ["student", "vehicle", "user"];

const TrashModelDef = { dbName: process.env.DB_NAME || "tamheed_db", collection: "RecycleBin" };

TrashModelDef.create = async function (data) {
  return await api.create({ dbName: this.dbName, collection: this.collection, data });
};
TrashModelDef.get = async function (filter = {}) {
  return await api.read({ dbName: this.dbName, collection: this.collection, filter });
};
TrashModelDef.delete = async function (filter) {
  return await api.delete({ dbName: this.dbName, collection: this.collection, filter });
};

module.exports = { TrashModelDef, KEEP_DAYS, KINDS };
