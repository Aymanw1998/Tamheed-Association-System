const api = require("../api");
const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");

const SportTeamModelDef = {
    dbName: process.env.DB_NAME || "tamheed_db",

    collections: {
        active: "SportTeams",
    },

    fields: {
        name: { type: "string", required: true },
        sportId: { type: "string", required: true },
        coachIds: { type: "array", required: false, default: [] },
        members: { type: "array", required: false, default: [] },
        createdAt: { type: "date", required: false, default: () => new Date() },
        updatedAt: { type: "date", required: false, default: () => new Date() },
    },
};

SportTeamModelDef.get = async function (filter = {}) {
    return await api.read({ dbName: this.dbName, collection: this.collections.active, filter });
};

SportTeamModelDef.create = async function (data) {
    return await api.create({ dbName: this.dbName, collection: this.collections.active, data });
};

SportTeamModelDef.update = async function (filter, newData) {
    return await api.update({ dbName: this.dbName, collection: this.collections.active, filter, newData });
};

SportTeamModelDef.updateExisting = async function (filter, newData) {
    return await api.updateExisting({ dbName: this.dbName, collection: this.collections.active, filter, newData });
};

SportTeamModelDef.delete = async function (filter) {
    return await api.delete({ dbName: this.dbName, collection: this.collections.active, filter });
};

const SPORT_TEAM_INDEXES = [{ key: { sportId: 1 } }, { key: { coachIds: 1 } }];
const ensureSportTeamIndexes = (collection) => ensureIndexes(
    collection || collectionOf({ dbName: SportTeamModelDef.dbName, collection: SportTeamModelDef.collections.active }),
    SPORT_TEAM_INDEXES,
);

module.exports = { SportTeamModelDef, SPORT_TEAM_INDEXES, ensureSportTeamIndexes };
