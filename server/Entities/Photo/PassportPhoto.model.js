const api = require("../api");

// The passport version of a student's or a user's photo (see
// services/passportPhotoJob.js), one per Drive file. The original stays in
// Drive; a new photo is a new file, so a row never goes stale. `failed` marks
// a file that is no picture (nothing is made from it).
const PassportPhotoModelDef = {
    dbName: process.env.DB_NAME || "tamheed_db",

    collections: {
        active: "PassportPhotos",
    },

    fields: {
        fileId: { type: "string", required: true }, // the original's Drive file id
        image: { type: "buffer", required: false },
        contentType: { type: "string", required: false },
        failed: { type: "boolean", required: false, default: false },
        checkedAt: { type: "date", required: false }, // when the original was last confirmed public
        createdAt: { type: "date", required: false, default: () => new Date() },
    },
};

PassportPhotoModelDef.get = async function (filter = {}) {
    return await api.read({ dbName: this.dbName, collection: this.collections.active, filter });
};

// Every row's file id, without the pictures.
PassportPhotoModelDef.listFileIds = async function () {
    const r = await api.readPage({
        dbName: this.dbName, collection: this.collections.active, limit: 0, projection: { fileId: 1 },
    });
    return (r?.result || []).map((row) => String(row.fileId));
};

PassportPhotoModelDef.put = async function (fileId, data) {
    return await api.update({ dbName: this.dbName, collection: this.collections.active, filter: { fileId }, newData: { ...data, fileId } });
};

// Sets fields on an existing row (never makes one).
PassportPhotoModelDef.touch = async function (fileId, data) {
    return await api.updateExisting({ dbName: this.dbName, collection: this.collections.active, filter: { fileId }, newData: data });
};

PassportPhotoModelDef.delete = async function (filter) {
    return await api.delete({ dbName: this.dbName, collection: this.collections.active, filter });
};

module.exports = { PassportPhotoModelDef };
