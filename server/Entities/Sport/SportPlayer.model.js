const api = require("../api");
const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");

const SportPlayerModelDef = {
    dbName: process.env.DB_NAME || "tamheed_db",

    collections: {
        active: "SportPlayers",
    },

    fields: {
        studentId: { type: "string", required: true },
        sportId: { type: "string", required: true },
        jerseyNumber: { type: "number", required: false, default: null },
        position: { type: "string", required: false, default: "" },
        createdAt: { type: "date", required: false, default: () => new Date() },
        updatedAt: { type: "date", required: false, default: () => new Date() },
    },
};

SportPlayerModelDef.get = async function (filter = {}) {
    return await api.read({ dbName: this.dbName, collection: this.collections.active, filter });
};

SportPlayerModelDef.create = async function (data) {
    return await api.create({ dbName: this.dbName, collection: this.collections.active, data });
};

SportPlayerModelDef.update = async function (filter, newData) {
    return await api.update({ dbName: this.dbName, collection: this.collections.active, filter, newData });
};

SportPlayerModelDef.updateExisting = async function (filter, newData) {
    return await api.updateExisting({ dbName: this.dbName, collection: this.collections.active, filter, newData });
};

SportPlayerModelDef.delete = async function (filter) {
    return await api.delete({ dbName: this.dbName, collection: this.collections.active, filter });
};

const SPORT_PLAYER_INDEXES = [{ key: { studentId: 1, sportId: 1 }, options: { unique: true } }];
const ensureSportPlayerIndexes = (collection) => ensureIndexes(
    collection || collectionOf({ dbName: SportPlayerModelDef.dbName, collection: SportPlayerModelDef.collections.active }),
    SPORT_PLAYER_INDEXES,
);

module.exports = { SportPlayerModelDef, SPORT_PLAYER_INDEXES, ensureSportPlayerIndexes };
