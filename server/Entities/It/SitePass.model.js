const api = require("../api");
const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");

// One-time passes between the everyday app and the IT site
// (Entities/It/sitePass.js): stored by hash only, removed on use, and removed
// by MongoDB once expired.
const SitePassModelDef = {
    dbName: process.env.DB_NAME || "tamheed_db",

    collections: {
        active: "SitePasses",
    },

    fields: {
        hash: { type: "string", required: true },
        tz: { type: "string", required: true },
        // "it" (everyday app → IT site) or "system" (IT site → everyday app).
        to: { type: "string", required: true },
        expiresAt: { type: "date", required: true },
    },
};

SitePassModelDef.get = async function (filter = {}) {
    return await api.read({ dbName: this.dbName, collection: this.collections.active, filter });
};

SitePassModelDef.create = async function (data) {
    return await api.create({ dbName: this.dbName, collection: this.collections.active, data });
};

SitePassModelDef.delete = async function (filter) {
    return await api.delete({ dbName: this.dbName, collection: this.collections.active, filter });
};

const SITE_PASS_INDEXES = [
    { key: { hash: 1 }, options: { unique: true } },
    { key: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
];
const ensureSitePassIndexes = (collection) => ensureIndexes(
    collection || collectionOf({ dbName: SitePassModelDef.dbName, collection: SitePassModelDef.collections.active }),
    SITE_PASS_INDEXES,
);

module.exports = { SitePassModelDef, SITE_PASS_INDEXES, ensureSitePassIndexes };
