const api = require("../api");

// The system-wide phone notifications switch, one row ({ name: "push" }).
// When the server file (.env) has no VAPID keys, the keys made on the first
// switch-on are kept here too. The private key never leaves the server: no
// route returns this row.
const PushSettingsModelDef = {
    dbName: process.env.DB_NAME || "tamheed_db",

    collections: {
        active: "PushSettings",
    },

    fields: {
        name: { type: "string", required: true }, // always "push"
        enabled: { type: "boolean", required: true },
        publicKey: { type: "string", required: false },
        privateKey: { type: "string", required: false },
        subject: { type: "string", required: false },
        updatedAt: { type: "date", required: false, default: () => new Date() },
        updatedBy: { type: "string", required: false }, // tz of the admin who switched it
    },
};

PushSettingsModelDef.read = async function () {
    const r = await api.read({ dbName: this.dbName, collection: this.collections.active, filter: { name: "push" } });
    return r?.result?.[0] || null;
};

// Upsert of the single row.
PushSettingsModelDef.write = async function (data) {
    return await api.update({ dbName: this.dbName, collection: this.collections.active, filter: { name: "push" }, newData: { ...data, name: "push" } });
};

module.exports = { PushSettingsModelDef };
