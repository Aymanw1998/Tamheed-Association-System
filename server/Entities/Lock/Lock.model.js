const api = require("../api");
const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");

// One row per locked item; `key` is unique, so only one tab can hold it.
const LockModelDef = {
    dbName: process.env.DB_NAME || "tamheed_db",

    collections: {
        active: "Locks",
    },

    fields: {
        key: { type: "string", required: true },
        clientId: { type: "string", required: true },
        userId: { type: "string", required: true },
        tz: { type: "string", required: true },
        name: { type: "string", required: true },
        acquiredAt: { type: "date", required: true },
        heartbeatAt: { type: "date", required: true },
        expiresAt: { type: "date", required: true },
    },
};

LockModelDef.get = async function (filter = {}) {
    return await api.read({ dbName: this.dbName, collection: this.collections.active, filter });
};

// Conditional upsert; throws E11000 when another tab holds the key.
LockModelDef.acquire = async function (filter, newData) {
    return await api.acquireOne({ dbName: this.dbName, collection: this.collections.active, filter, newData });
};

LockModelDef.updateExisting = async function (filter, newData) {
    return await api.updateExisting({ dbName: this.dbName, collection: this.collections.active, filter, newData });
};

LockModelDef.delete = async function (filter) {
    return await api.delete({ dbName: this.dbName, collection: this.collections.active, filter });
};

// The TTL index lets MongoDB drop expired rows by itself (expiresAt is the
// moment the lock lapses).
const LOCK_INDEXES = [
    { key: { key: 1 }, options: { unique: true } },
    { key: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
];
const ensureLockIndexes = (collection) => ensureIndexes(
    collection || collectionOf({ dbName: LockModelDef.dbName, collection: LockModelDef.collections.active }),
    LOCK_INDEXES,
);

module.exports = { LockModelDef, LOCK_INDEXES, ensureLockIndexes };
