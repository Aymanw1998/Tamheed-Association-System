const api = require("../api");

// A notice from the sport staff to the players: to every player of the sport,
// or to one lesson's players (lessonId). Shown on the sport site until
// expiresOn (an Israel date "YYYY-MM-DD", inclusive), or always when null.
const SportNoticeModelDef = {
    dbName: process.env.DB_NAME || "tamheed_db",

    collections: {
        active: "SportNotices",
    },

    fields: {
        sportId: { type: "string", required: true },
        title: { type: "string", required: true },
        body: { type: "string", required: false, default: "" },
        lessonId: { type: "string", required: false, default: null },
        expiresOn: { type: "string", required: false, default: null },
        createdBy: { type: "object", required: false, default: null }, // { id, name }
        createdAt: { type: "date", required: false, default: () => new Date() },
    },
};

SportNoticeModelDef.get = async function (filter = {}) {
    return await api.read({ dbName: this.dbName, collection: this.collections.active, filter });
};

SportNoticeModelDef.create = async function (data) {
    return await api.create({ dbName: this.dbName, collection: this.collections.active, data });
};

SportNoticeModelDef.delete = async function (filter) {
    return await api.delete({ dbName: this.dbName, collection: this.collections.active, filter });
};

module.exports = { SportNoticeModelDef };
