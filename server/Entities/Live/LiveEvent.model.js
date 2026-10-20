const api = require("../api");
const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");

// One row per recipient per live event: recipientTz, type ("storage", later
// "alert"), payload, at. Every server process's stream reads its user's new
// rows from here, so publishing works across processes. Rows expire after
// 10 minutes; a client that was away longer reloads its data anyway.
const dbName = process.env.DB_NAME || "tamheed_db";
const LIVE_EVENT_TTL_SECONDS = 10 * 60;

const LiveEventModelDef = { dbName, collection: "LiveEvents" };
LiveEventModelDef.create = async function (data) {
  return await api.create({ dbName: this.dbName, collection: this.collection, data });
};
// The recipient's rows with at >= `from`, oldest first (see overlapCursor).
// No count: this runs on every poll of every open stream.
LiveEventModelDef.since = async function (recipientTz, from, limit = 500) {
  const res = await api.readSorted({
    dbName: this.dbName,
    collection: this.collection,
    filter: { recipientTz, at: { $gte: from } },
    sort: { at: 1, _id: 1 },
    limit,
  });
  return res.result;
};

const LIVE_EVENT_INDEXES = [
  { key: { recipientTz: 1, at: 1 } },
  { key: { at: 1 }, options: { expireAfterSeconds: LIVE_EVENT_TTL_SECONDS } },
];
const ensureLiveEventIndexes = (collection) =>
  ensureIndexes(collection || collectionOf(LiveEventModelDef), LIVE_EVENT_INDEXES);

module.exports = { LiveEventModelDef, LIVE_EVENT_TTL_SECONDS, LIVE_EVENT_INDEXES, ensureLiveEventIndexes };
