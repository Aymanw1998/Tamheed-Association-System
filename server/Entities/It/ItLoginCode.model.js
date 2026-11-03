const api = require("../api");
const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");

// The IT site's email codes (Entities/It/It.auth.js): one per user, hashed,
// removed by MongoDB once expired.
const ItLoginCodeModelDef = {
    dbName: process.env.DB_NAME || "tamheed_db",

    collections: {
        active: "ItLoginCodes",
    },

    fields: {
        userTz: { type: "string", required: true },
        // null once five wrong tries ended the code.
        codeHash: { type: "string", required: false, default: null },
        expiresAt: { type: "date", required: true },
        attempts: { type: "number", required: false, default: 0 },
    },
};

ItLoginCodeModelDef.get = async function (filter = {}) {
    return await api.read({ dbName: this.dbName, collection: this.collections.active, filter });
};

ItLoginCodeModelDef.update = async function (filter, newData) {
    return await api.update({ dbName: this.dbName, collection: this.collections.active, filter, newData });
};

ItLoginCodeModelDef.increment = async function (filter, field, by = 1) {
    return await api.increment({ dbName: this.dbName, collection: this.collections.active, filter, field, by });
};

ItLoginCodeModelDef.updateExisting = async function (filter, newData) {
    return await api.updateExisting({ dbName: this.dbName, collection: this.collections.active, filter, newData });
};

ItLoginCodeModelDef.delete = async function (filter) {
    return await api.delete({ dbName: this.dbName, collection: this.collections.active, filter });
};

const IT_LOGIN_CODE_INDEXES = [
    { key: { userTz: 1 }, options: { unique: true } },
    { key: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
];
const ensureItLoginCodeIndexes = (collection) => ensureIndexes(
    collection || collectionOf({ dbName: ItLoginCodeModelDef.dbName, collection: ItLoginCodeModelDef.collections.active }),
    IT_LOGIN_CODE_INDEXES,
);

module.exports = { ItLoginCodeModelDef, IT_LOGIN_CODE_INDEXES, ensureItLoginCodeIndexes };
