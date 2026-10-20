const api = require("../api");
const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");

// AiAlerts: each user's personal alert inbox. One row per recipient:
//   recipientTz, type, severity (critical | important | info),
//   text { ar, he, en }, link (a client route), dedupKey, readAt (null = unread), at.
// The unique { recipientTz, dedupKey } index makes a repeated alert impossible
// even when two server processes raise it at once.
const dbName = process.env.DB_NAME || "tamheed_db";

const isDuplicate = (err) => err && (err.code === 11000 || /E11000/.test(String(err.message)));

const AlertModelDef = { dbName, collection: "AiAlerts" };

// Inserts the row unless this recipient already has its dedupKey.
AlertModelDef.insertOnce = async function (doc) {
  const found = await api.read({
    dbName: this.dbName,
    collection: this.collection,
    filter: { recipientTz: doc.recipientTz, dedupKey: doc.dedupKey },
  });
  if (found?.result?.length) return { created: false };
  try {
    const created = await api.create({ dbName: this.dbName, collection: this.collection, data: doc });
    return { created: true, alert: created.result };
  } catch (err) {
    if (isDuplicate(err)) return { created: false };
    throw err;
  }
};

// The recipient's alerts, newest first; total counts every match. `types`
// (optional) limits the result to those alert types.
AlertModelDef.listFor = async function (recipientTz, { unreadOnly = false, limit = 50, types } = {}) {
  const filter = { recipientTz };
  if (unreadOnly) filter.readAt = null;
  if (Array.isArray(types)) filter.type = { $in: types };
  const res = await api.readPage({
    dbName: this.dbName,
    collection: this.collection,
    filter,
    sort: { at: -1, _id: -1 },
    limit,
  });
  return { result: res.result, total: res.total };
};

// Marks one of the recipient's own alerts read. Null when it is not theirs.
AlertModelDef.markRead = async function (recipientTz, id, at = new Date()) {
  const filter = { _id: String(id), recipientTz };
  const res = await api.updateExisting({
    dbName: this.dbName,
    collection: this.collection,
    filter: { ...filter, readAt: null },
    newData: { readAt: at },
  });
  if (res.result) return res.result;
  // Already read: still the caller's own alert.
  const found = await api.read({ dbName: this.dbName, collection: this.collection, filter });
  return found?.result?.[0] || null;
};

AlertModelDef.markAllRead = async function (recipientTz, at = new Date()) {
  const res = await api.updateMany({
    dbName: this.dbName,
    collection: this.collection,
    filter: { recipientTz, readAt: null },
    newData: { readAt: at },
  });
  return res.result?.modifiedCount || 0;
};

// The recipient's unread rows with at >= `from`, oldest first (for the live
// stream's overlapCursor). No count: this runs on every poll.
AlertModelDef.since = async function (recipientTz, from, limit = 500) {
  const res = await api.readSorted({
    dbName: this.dbName,
    collection: this.collection,
    filter: { recipientTz, readAt: null, at: { $gte: from } },
    sort: { at: 1, _id: 1 },
    limit,
  });
  return res.result;
};

// Alerts are removed 180 days after they were raised.
const ALERT_TTL_SECONDS = 180 * 24 * 60 * 60;

const ALERT_INDEXES = [
  { key: { recipientTz: 1, dedupKey: 1 }, options: { unique: true } },
  { key: { recipientTz: 1, at: 1 } },
  { key: { at: 1 }, options: { expireAfterSeconds: ALERT_TTL_SECONDS } },
];
const ensureAlertIndexes = (collection) => ensureIndexes(collection || collectionOf(AlertModelDef), ALERT_INDEXES);

module.exports = { AlertModelDef, ALERT_INDEXES, ALERT_TTL_SECONDS, ensureAlertIndexes };
