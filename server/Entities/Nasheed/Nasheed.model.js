const api = require("../api");

const dbName = process.env.DB_NAME || "tamheed_db";

// The nasheed library (owner, 2026-11-27).
// { title, lines: [{ kind: "verse", sadr, ajuz } | { kind: "center", text } | { kind: "break" }],
//   createdBy: { tz, name }, updatedBy: { tz, name }, createdAt, updatedAt }
const modelFor = (collection) => ({
  dbName,
  collection,
  async get(filter = {}) { return api.read({ dbName, collection, filter }); },
  async create(data) { return api.create({ dbName, collection, data }); },
  async updateExisting(filter, newData) { return api.updateExisting({ dbName, collection, filter, newData }); },
  async delete(filter) { return api.delete({ dbName, collection, filter }); },
});

const NasheedModelDef = modelFor("Nasheeds");

module.exports = { NasheedModelDef };
