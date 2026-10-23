const api = require("../api");
const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");

const SportTrainingModelDef = {
    dbName: process.env.DB_NAME || "tamheed_db",

    collections: {
        active: "SportTrainings",
    },

    fields: {
        teamId: { type: "string", required: true },
        sportId: { type: "string", required: true },
        startsAt: { type: "date", required: true },
        place: { type: "string", required: false, default: "" },
        presentIds: { type: "array", required: false, default: [] },
        recorded: { type: "boolean", required: false, default: false },
        createdAt: { type: "date", required: false, default: () => new Date() },
        updatedAt: { type: "date", required: false, default: () => new Date() },
    },
};

SportTrainingModelDef.get = async function (filter = {}) {
    return await api.read({ dbName: this.dbName, collection: this.collections.active, filter });
};

SportTrainingModelDef.create = async function (data) {
    return await api.create({ dbName: this.dbName, collection: this.collections.active, data });
};

SportTrainingModelDef.update = async function (filter, newData) {
    return await api.update({ dbName: this.dbName, collection: this.collections.active, filter, newData });
};

SportTrainingModelDef.updateExisting = async function (filter, newData) {
    return await api.updateExisting({ dbName: this.dbName, collection: this.collections.active, filter, newData });
};

SportTrainingModelDef.delete = async function (filter) {
    return await api.delete({ dbName: this.dbName, collection: this.collections.active, filter });
};

const SPORT_TRAINING_INDEXES = [{ key: { teamId: 1, startsAt: 1 } }];
const ensureSportTrainingIndexes = (collection) => ensureIndexes(
    collection || collectionOf({ dbName: SportTrainingModelDef.dbName, collection: SportTrainingModelDef.collections.active }),
    SPORT_TRAINING_INDEXES,
);

module.exports = { SportTrainingModelDef, SPORT_TRAINING_INDEXES, ensureSportTrainingIndexes };
