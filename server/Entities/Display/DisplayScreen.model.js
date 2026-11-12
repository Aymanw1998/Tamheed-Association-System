const api = require("../api");

const dbName = process.env.DB_NAME || "tamheed_db";

// Wall display screens (owner, 2026-11-12).
// { name, layout ("week" | "today" | "rotate"), tokenHash (sha256 hex of the
//   link secret; the secret itself is never stored), createdAt, updatedAt }
const modelFor = (collection) => ({
  dbName,
  collection,
  async get(filter = {}) { return api.read({ dbName, collection, filter }); },
  async create(data) { return api.create({ dbName, collection, data }); },
  async updateExisting(filter, newData) { return api.updateExisting({ dbName, collection, filter, newData }); },
  async delete(filter) { return api.delete({ dbName, collection, filter }); },
});

const DisplayScreenModelDef = modelFor("DisplayScreens");

async function ensureDisplayScreenIndexes() {
  const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");
  await ensureIndexes(collectionOf(DisplayScreenModelDef), [{ key: { tokenHash: 1 }, options: { unique: true } }]);
}

module.exports = { DisplayScreenModelDef, ensureDisplayScreenIndexes };
