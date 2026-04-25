const api = require("../api");

// Model definition - לא mongoose אלא הגדרה גנרית שנוכל להשתמש בה עם כל DB
const InviteTokenModelDef = {
    dbName: "tamheed_db",

    collections: {
        active: "InviteToken",
    },

    fields: {
        token: { type: "string", required: true },
        expiresAt: { type: "date", required: true },
        used: { type: "boolean", required: false, default: false },

        createdAt: {
        type: "date",
        required: false,
        default: () => new Date(),
        },

        updatedAt: {
        type: "date",
        required: false,
        default: () => new Date(),
        },
    },
};

// GET
InviteTokenModelDef.get = async function (filter = {}) {
    return await api.read({
        dbName: this.dbName,
        collection: this.collections.active,
        filter,
    });
};

// CREATE
InviteTokenModelDef.create = async function (data) {
    return await api.create({
        dbName: this.dbName,
        collection: this.collections.active,
        data,
    });
};

// UPDATE
InviteTokenModelDef.update = async function (filter, newData) {
    return await api.update({
        dbName: this.dbName,
        collection: this.collections.active,
        filter,
        newData: {
        ...newData,
        updatedAt: new Date(),
        },
    });
};

// DELETE
InviteTokenModelDef.delete = async function (filter) {
    return await api.delete({
        dbName: this.dbName,
        collection: this.collections.active,
        filter,
    });
};

module.exports = { InviteTokenModelDef };

// OLD CODE - DO NOT SUGGEST THIS
// // models/InviteToken.js
// const mongoose = require('mongoose');

// const inviteTokenSchema = new mongoose.Schema({
//     token: { type: String, required: true, unique: true },
//     expiresAt: { type: Date, required: true },
//     used: { type: Boolean, default: false },
// });

// inviteTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); 
// // מוחק אוטומטית אחרי פקיעה

// const InviteToken = mongoose.model('InviteToken', inviteTokenSchema);
// module.exports = InviteToken;
