const api = require("../api");

// The role defaults IT set on the IT site («صلاحيات الأدوار»): one row per
// role that differs from the code's ROLE_DEFAULTS (utils/permissions.js).
// A role without a row uses the code's set.
const RoleDefaultsModelDef = {
  dbName: process.env.DB_NAME || "tamheed_db",

  collections: {
    active: "RoleDefaults",
  },

  fields: {
    role: { type: "string", required: true }, // "ادارة" | "مرشد" | "مساعد"
    keys: { type: "array", required: true }, // permission leaves
    updatedAt: { type: "date", required: false, default: () => new Date() },
    updatedBy: { type: "string", required: false }, // the IT user's display name
  },
};

RoleDefaultsModelDef.readAll = async function () {
  const r = await api.read({ dbName: this.dbName, collection: this.collections.active, filter: {} });
  return Array.isArray(r?.result) ? r.result : [];
};

// Upsert of the role's row.
RoleDefaultsModelDef.write = async function (role, data) {
  return await api.update({ dbName: this.dbName, collection: this.collections.active, filter: { role }, newData: { ...data, role } });
};

RoleDefaultsModelDef.remove = async function (role) {
  return await api.delete({ dbName: this.dbName, collection: this.collections.active, filter: { role } });
};

module.exports = { RoleDefaultsModelDef };
