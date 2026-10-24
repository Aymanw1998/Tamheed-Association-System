const api = require("../api");
const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");

// PushSubscriptions: one row per browser/device endpoint.
//   kind "staff" -> tz is the user's ID number; kind "sport" -> studentId.
const PushSubscriptionModelDef = {
    dbName: process.env.DB_NAME || "tamheed_db",

    collections: {
        active: "PushSubscriptions",
    },

    fields: {
        kind: { type: "string", required: true },
        tz: { type: "string", required: false, default: null },
        studentId: { type: "string", required: false, default: null },
        endpoint: { type: "string", required: true },
        keys: { type: "object", required: true },
        createdAt: { type: "date", required: true },
    },
};

const rows = (res) => res?.result || [];

PushSubscriptionModelDef.listStaff = async function (tzs) {
    if (!tzs?.length) return [];
    return rows(await api.read({
        dbName: this.dbName, collection: this.collections.active,
        filter: { kind: "staff", tz: { $in: tzs.map(String) } },
    }));
};

PushSubscriptionModelDef.listStudents = async function (studentIds) {
    if (!studentIds?.length) return [];
    return rows(await api.read({
        dbName: this.dbName, collection: this.collections.active,
        filter: { kind: "sport", studentId: { $in: studentIds.map(String) } },
    }));
};

// One row per endpoint: the latest sign-in on a device owns it.
PushSubscriptionModelDef.upsert = async function (doc) {
    const { endpoint, ...rest } = doc;
    return await api.update({
        dbName: this.dbName, collection: this.collections.active,
        filter: { endpoint }, newData: { ...rest, endpoint },
    });
};

// `owner` ({ tz } or { studentId }) limits the delete to the caller's own row.
PushSubscriptionModelDef.remove = async function (endpoint, owner = {}) {
    const filter = { endpoint };
    if (owner.tz) filter.tz = String(owner.tz);
    if (owner.studentId) filter.studentId = String(owner.studentId);
    return await api.delete({ dbName: this.dbName, collection: this.collections.active, filter });
};

const PUSH_SUBSCRIPTION_INDEXES = [{ key: { endpoint: 1 }, options: { unique: true } }];
const ensurePushSubscriptionIndexes = (collection) => ensureIndexes(
    collection || collectionOf({ dbName: PushSubscriptionModelDef.dbName, collection: PushSubscriptionModelDef.collections.active }),
    PUSH_SUBSCRIPTION_INDEXES,
);

module.exports = { PushSubscriptionModelDef, PUSH_SUBSCRIPTION_INDEXES, ensurePushSubscriptionIndexes };
