const api = require("../api");
const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");

const SportLoginCodeModelDef = {
    dbName: process.env.DB_NAME || "tamheed_db",

    collections: {
        active: "SportLoginCodes",
    },

    fields: {
        studentId: { type: "string", required: true },
        codeHash: { type: "string", required: true },
        expiresAt: { type: "date", required: true },
        sentAt: { type: "date", required: true },
        attempts: { type: "number", required: false, default: 0 },
        lockedUntil: { type: "date", required: false, default: null },
    },
};

SportLoginCodeModelDef.get = async function (filter = {}) {
    return await api.read({ dbName: this.dbName, collection: this.collections.active, filter });
};

SportLoginCodeModelDef.create = async function (data) {
    return await api.create({ dbName: this.dbName, collection: this.collections.active, data });
};

SportLoginCodeModelDef.update = async function (filter, newData) {
    return await api.update({ dbName: this.dbName, collection: this.collections.active, filter, newData });
};

SportLoginCodeModelDef.increment = async function (filter, field, by = 1) {
    return await api.increment({ dbName: this.dbName, collection: this.collections.active, filter, field, by });
};

SportLoginCodeModelDef.updateExisting = async function (filter, newData) {
    return await api.updateExisting({ dbName: this.dbName, collection: this.collections.active, filter, newData });
};

SportLoginCodeModelDef.delete = async function (filter) {
    return await api.delete({ dbName: this.dbName, collection: this.collections.active, filter });
};

const SPORT_LOGIN_CODE_INDEXES = [{ key: { studentId: 1 }, options: { unique: true } }];
const ensureSportLoginCodeIndexes = (collection) => ensureIndexes(
    collection || collectionOf({ dbName: SportLoginCodeModelDef.dbName, collection: SportLoginCodeModelDef.collections.active }),
    SPORT_LOGIN_CODE_INDEXES,
);

module.exports = { SportLoginCodeModelDef, SPORT_LOGIN_CODE_INDEXES, ensureSportLoginCodeIndexes };
