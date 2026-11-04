const api = require("../api");
const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");

// System's sign-in email codes (SystemCode.auth.js): one per user, hashed,
// removed by MongoDB once expired.
const SystemLoginCodeModelDef = {
    dbName: process.env.DB_NAME || "tamheed_db",

    collections: {
        active: "SystemLoginCodes",
    },

    fields: {
        userTz: { type: "string", required: true },
        // null once five wrong tries ended the code.
        codeHash: { type: "string", required: false, default: null },
        expiresAt: { type: "date", required: true },
        attempts: { type: "number", required: false, default: 0 },
    },
};

SystemLoginCodeModelDef.get = async function (filter = {}) {
    return await api.read({ dbName: this.dbName, collection: this.collections.active, filter });
};

SystemLoginCodeModelDef.update = async function (filter, newData) {
    return await api.update({ dbName: this.dbName, collection: this.collections.active, filter, newData });
};

SystemLoginCodeModelDef.increment = async function (filter, field, by = 1) {
    return await api.increment({ dbName: this.dbName, collection: this.collections.active, filter, field, by });
};

SystemLoginCodeModelDef.updateExisting = async function (filter, newData) {
    return await api.updateExisting({ dbName: this.dbName, collection: this.collections.active, filter, newData });
};

SystemLoginCodeModelDef.delete = async function (filter) {
    return await api.delete({ dbName: this.dbName, collection: this.collections.active, filter });
};

const SYSTEM_LOGIN_CODE_INDEXES = [
    { key: { userTz: 1 }, options: { unique: true } },
    { key: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
];
const ensureSystemLoginCodeIndexes = (collection) => ensureIndexes(
    collection || collectionOf({ dbName: SystemLoginCodeModelDef.dbName, collection: SystemLoginCodeModelDef.collections.active }),
    SYSTEM_LOGIN_CODE_INDEXES,
);

module.exports = { SystemLoginCodeModelDef, SYSTEM_LOGIN_CODE_INDEXES, ensureSystemLoginCodeIndexes };
