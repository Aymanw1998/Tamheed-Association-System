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
        stats: { type: "object", default: {} }, // { [statKey]: number }
        lastCardPushAt: { type: "date", required: false, default: null },
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

// Atomic +1 / -1 on one stat of one player; the value never goes below 0.
// Returns the new value.
SportPlayerModelDef.bumpStat = async function (id, key, delta) {
    const field = `stats.${key}`;
    const filter = delta < 0 ? { _id: id, [field]: { $gte: 1 } } : { _id: id };
    const res = await api.increment({ dbName: this.dbName, collection: this.collections.active, filter, field, by: delta });
    return Number(res?.result?.stats?.[key]) || 0;
};

// Removes the given stat keys from every player.
SportPlayerModelDef.unsetStats = async function (keys) {
    if (!keys.length) return { success: true };
    return await api.unsetMany({
        dbName: this.dbName, collection: this.collections.active, filter: {}, fields: keys.map((k) => `stats.${k}`),
    });
};

const SPORT_PLAYER_INDEXES = [{ key: { studentId: 1, sportId: 1 }, options: { unique: true } }];
const ensureSportPlayerIndexes = (collection) => ensureIndexes(
    collection || collectionOf({ dbName: SportPlayerModelDef.dbName, collection: SportPlayerModelDef.collections.active }),
    SPORT_PLAYER_INDEXES,
);

module.exports = { SportPlayerModelDef, SPORT_PLAYER_INDEXES, ensureSportPlayerIndexes };
