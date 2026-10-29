const api = require("../api");

// A player's cut-out photo (see services/playerPhoto.service.js), one per
// student and sport. The picture itself lives here; the player row only keeps
// which source photo it was made from (`photoCutout`), so lists never load it.
const SportPlayerPhotoModelDef = {
    dbName: process.env.DB_NAME || "tamheed_db",

    collections: {
        active: "SportPlayerPhotos",
    },

    fields: {
        studentId: { type: "string", required: true },
        sportId: { type: "string", required: true },
        sourceVersion: { type: "string", required: true }, // photoVersion() of the student's photo link
        image: { type: "buffer", required: true },
        contentType: { type: "string", required: true },
        createdAt: { type: "date", required: false, default: () => new Date() },
    },
};

SportPlayerPhotoModelDef.get = async function (filter = {}) {
    return await api.read({ dbName: this.dbName, collection: this.collections.active, filter });
};

// Replaces the student's photo for the sport (upsert).
SportPlayerPhotoModelDef.put = async function (filter, data) {
    return await api.update({ dbName: this.dbName, collection: this.collections.active, filter, newData: data });
};

SportPlayerPhotoModelDef.delete = async function (filter) {
    return await api.delete({ dbName: this.dbName, collection: this.collections.active, filter });
};

module.exports = { SportPlayerPhotoModelDef };
