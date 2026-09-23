const api = require("../api");

// Parent-link requests refused because the ID number was already known.
// Staff review them next to the registration link (the app has no
// notifications module), so only recent ones are kept.
const RegistrationAttemptModelDef = {
    dbName: "tamheed_db",

    collections: {
        active: "RegistrationAttempts",
    },
};

// GET
RegistrationAttemptModelDef.get = async function (filter = {}) {
    return await api.read({
        dbName: this.dbName,
        collection: this.collections.active,
        filter,
    });
};

// CREATE
RegistrationAttemptModelDef.create = async function (data) {
    return await api.create({
        dbName: this.dbName,
        collection: this.collections.active,
        data,
    });
};

// DELETE
RegistrationAttemptModelDef.delete = async function (filter) {
    return await api.delete({
        dbName: this.dbName,
        collection: this.collections.active,
        filter,
    });
};

module.exports = { RegistrationAttemptModelDef };
