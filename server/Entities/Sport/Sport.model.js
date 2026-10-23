const api = require("../api");
const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");

const SportModelDef = {
    dbName: process.env.DB_NAME || "tamheed_db",

    collections: {
        active: "Sports",
    },

    fields: {
        name: { type: "string", required: true },
        icon: { type: "string", required: false, default: "" },
        stats: { type: "array", required: false, default: [] },
        createdAt: { type: "date", required: false, default: () => new Date() },
        updatedAt: { type: "date", required: false, default: () => new Date() },
    },
};

SportModelDef.get = async function (filter = {}) {
    return await api.read({ dbName: this.dbName, collection: this.collections.active, filter });
};

SportModelDef.create = async function (data) {
    return await api.create({ dbName: this.dbName, collection: this.collections.active, data });
};

SportModelDef.update = async function (filter, newData) {
    return await api.update({ dbName: this.dbName, collection: this.collections.active, filter, newData });
};

SportModelDef.updateExisting = async function (filter, newData) {
    return await api.updateExisting({ dbName: this.dbName, collection: this.collections.active, filter, newData });
};

SportModelDef.delete = async function (filter) {
    return await api.delete({ dbName: this.dbName, collection: this.collections.active, filter });
};

module.exports = { SportModelDef };
