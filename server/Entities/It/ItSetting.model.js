const api = require("../api");

// Settings IT changes on the IT site: one row per key.
const ItSettingModelDef = {
  dbName: process.env.DB_NAME || "tamheed_db",

  collections: {
    active: "ItSettings",
  },

  fields: {
    key: { type: "string", required: true },
    enabled: { type: "boolean", required: false },
    updatedAt: { type: "date", required: false, default: () => new Date() },
    updatedBy: { type: "string", required: false },
  },
};

ItSettingModelDef.readKey = async function (key) {
  const r = await api.read({ dbName: this.dbName, collection: this.collections.active, filter: { key } });
  return Array.isArray(r?.result) ? r.result[0] || null : null;
};

// Upsert of the key's row.
ItSettingModelDef.write = async function (key, data) {
  return await api.update({ dbName: this.dbName, collection: this.collections.active, filter: { key }, newData: { ...data, key } });
};

module.exports = { ItSettingModelDef };
