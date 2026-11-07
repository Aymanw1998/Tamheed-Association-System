const api = require("../api");
const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");
const { expiryOnRaise, expiryOnRead, prefixPattern, VEHICLE_TYPES, READ_KEEP_DAYS, UNREAD_KEEP_DAYS } = require("../../services/alertRetention");

// AiAlerts: each user's personal alert inbox. One row per recipient:
//   recipientTz, type, severity (critical | important | info),
//   text { ar, he, en }, link (a client route), dedupKey, readAt (null = unread), at,
//   expireAt (when the TTL index deletes the row; null = kept, services/alertRetention).
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
    const data = { ...doc, expireAt: expiryOnRaise(doc.type, doc.at || new Date()) };
    const created = await api.create({ dbName: this.dbName, collection: this.collection, data });
    return { created: true, alert: created.result };
  } catch (err) {
    if (isDuplicate(err)) return { created: false };
    throw err;
  }
};

// The recipient's alerts, newest first; total counts every match. `types`
// (optional) limits the result to those alert types.
AlertModelDef.listFor = async function (recipientTz, { unreadOnly = false, limit = 50, types, skip = 0, dismissed = false } = {}) {
  const filter = { recipientTz, dismissedAt: dismissed ? { $ne: null } : null };
  if (unreadOnly) filter.readAt = null;
  if (Array.isArray(types)) filter.type = { $in: types };
  const res = await api.readPage({
    dbName: this.dbName,
    collection: this.collection,
    filter,
    sort: { at: -1, _id: -1 },
    limit,
    skip,
  });
  return { result: res.result, total: res.total };
};
AlertModelDef.dismiss = async function (recipientTz, id, dismissed) {
  const result = await api.updateExisting({ dbName: this.dbName, collection: this.collection,
    filter: { _id: String(id), recipientTz }, newData: { dismissedAt: dismissed ? new Date() : null } });
  return result.result || null;
};

// Marks one of the recipient's own alerts read; from then it is kept 30 days
// (a vehicle alert until the renewal). Null when it is not theirs.
AlertModelDef.markRead = async function (recipientTz, id, at = new Date()) {
  const filter = { _id: String(id), recipientTz };
  const found = await api.read({ dbName: this.dbName, collection: this.collection, filter });
  const row = found?.result?.[0] || null;
  // Already read: still the caller's own alert.
  if (!row || row.readAt) return row;
  const res = await api.updateExisting({
    dbName: this.dbName,
    collection: this.collection,
    filter: { ...filter, readAt: null },
    newData: { readAt: at, expireAt: expiryOnRead(row.type, at) },
  });
  return res.result || row;
};

const VEHICLE = [...VEHICLE_TYPES];
AlertModelDef.markAllRead = async function (recipientTz, at = new Date()) {
  const unread = { recipientTz, readAt: null };
  const ordinary = await api.updateMany({
    dbName: this.dbName,
    collection: this.collection,
    filter: { ...unread, type: { $nin: VEHICLE } },
    newData: { readAt: at, expireAt: expiryOnRead("", at) },
  });
  const vehicle = await api.updateMany({
    dbName: this.dbName,
    collection: this.collection,
    filter: { ...unread, type: { $in: VEHICLE } },
    newData: { readAt: at },
  });
  return (ordinary.result?.modifiedCount || 0) + (vehicle.result?.modifiedCount || 0);
};

// Every recipient's rows whose dedupKey starts with one of the prefixes (the
// alerts of a deleted record, services/alertRetention.recordPrefixes).
AlertModelDef.removeByPrefixes = async function (prefixes = []) {
  const list = prefixes.filter(Boolean);
  if (!list.length) return 0;
  const res = await api.delete({
    dbName: this.dbName,
    collection: this.collection,
    filter: { $or: list.map((prefix) => ({ dedupKey: { $regex: prefixPattern(prefix) } })) },
  });
  return res.result?.deletedCount || 0;
};

// Rows under the prefix whose key is not one of keepKeys (a renewed or
// superseded vehicle stage).
AlertModelDef.removeExcept = async function (prefix, keepKeys = []) {
  const res = await api.delete({
    dbName: this.dbName,
    collection: this.collection,
    filter: { dedupKey: { $regex: prefixPattern(prefix), $nin: [...keepKeys] } },
  });
  return res.result?.deletedCount || 0;
};

// A deleted user's own inbox.
AlertModelDef.removeForRecipient = async function (recipientTz) {
  const tz = String(recipientTz ?? "").trim();
  if (!tz) return 0;
  const res = await api.delete({ dbName: this.dbName, collection: this.collection, filter: { recipientTz: tz } });
  return res.result?.deletedCount || 0;
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

// A row is deleted at its expireAt; rows without one are kept.
const ALERT_INDEXES = [
  { key: { recipientTz: 1, dedupKey: 1 }, options: { unique: true } },
  { key: { recipientTz: 1, at: 1 } },
  { key: { expireAt: 1 }, options: { expireAfterSeconds: 0 } },
];

const DAY_MS = 24 * 60 * 60 * 1000;
// Until 2026-11-02 every row was deleted 180 days after `at`. That index goes,
// and older rows get an expireAt by the new rules (MongoDB 4.2+ pipeline update).
async function ensureAlertIndexes(collection = collectionOf(AlertModelDef)) {
  const old = ((await collection.indexes()) || []).find((i) => i.name === "at_1" && i.expireAfterSeconds !== undefined);
  if (old) await collection.dropIndex(old.name);
  await ensureIndexes(collection, ALERT_INDEXES);
  const before = { expireAt: { $exists: false } };
  await collection.updateMany(
    { ...before, readAt: { $ne: null }, type: { $nin: VEHICLE } },
    [{ $set: { expireAt: { $add: ["$readAt", READ_KEEP_DAYS * DAY_MS] } } }],
  );
  await collection.updateMany(
    { ...before, readAt: null, type: { $nin: ["parent_registration", ...VEHICLE] } },
    [{ $set: { expireAt: { $add: ["$at", UNREAD_KEEP_DAYS * DAY_MS] } } }],
  );
}

module.exports = { AlertModelDef, ALERT_INDEXES, ensureAlertIndexes };
