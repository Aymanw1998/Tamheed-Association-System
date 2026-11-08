const mongoose = require("mongoose");
const api = require("../api");

// Board items for the administrators. Shape:
//   title, body, category ("vehicle"|"system"|"manual"),
//   severity ("critical"|"important"|"info"), link, dedupKey (unique when set),
//   createdBy ("system"|userId), createdByName, createdAt, readBy[], archivedAt, archivedBy
const dbName = process.env.DB_NAME || "tamheed_db";

const NoticeModelDef = { dbName, collection: "Notices" };
NoticeModelDef.get = async function (filter = {}) {
  return await api.read({ dbName: this.dbName, collection: this.collection, filter });
};
NoticeModelDef.create = async function (data) {
  return await api.create({ dbName: this.dbName, collection: this.collection, data });
};
// Every notice whose dedupKey starts with one of the prefixes (a deleted
// vehicle's), and those under a prefix that are not current (services/recordAlerts).
const { prefixPattern } = require("../../services/alertRetention");
NoticeModelDef.removeByPrefixes = async function (prefixes = []) {
  const list = prefixes.filter(Boolean);
  if (!list.length) return 0;
  const filter = { $or: list.map((p) => ({ dedupKey: { $regex: prefixPattern(p) } })) };
  return (await api.delete({ dbName: this.dbName, collection: this.collection, filter }))?.result?.deletedCount || 0;
};
NoticeModelDef.removeExcept = async function (prefix, keepKeys = []) {
  const filter = { dedupKey: { $regex: prefixPattern(prefix), $nin: [...keepKeys] } };
  return (await api.delete({ dbName: this.dbName, collection: this.collection, filter }))?.result?.deletedCount || 0;
};
// api.update upserts, so callers must have loaded the notice first.
NoticeModelDef.update = async function (filter, newData) {
  return await api.update({ dbName: this.dbName, collection: this.collection, filter, newData });
};
// Concurrent personal dismissals must not overwrite another reader's choice.
NoticeModelDef.setHidden = async function (id, reader, hidden) {
  const collection = mongoose.connection.useDb(this.dbName, { useCache: true }).collection(this.collection);
  return collection.updateOne({ _id: new mongoose.Types.ObjectId(String(id)) },
    hidden ? { $addToSet: { hiddenBy: String(reader) } } : { $pull: { hiddenBy: String(reader) } });
};

// Marks the notices read by one reader in a single update (readBy may only
// grow; a reader already in it keeps the first read time).
NoticeModelDef.markReadMany = async function (ids, reader, at) {
  const collection = mongoose.connection.useDb(this.dbName, { useCache: true }).collection(this.collection);
  const key = String(reader);
  return collection.updateMany({ _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(String(id))) }, readBy: { $ne: key } },
    { $addToSet: { readBy: key }, $set: { [`readTimes.${key}`]: at } });
};
// Sets fields on the one row matching filter, never inserting; the updated
// row, or null when none matched (a state change in between).
NoticeModelDef.updateIf = async function (filter, newData) {
  return (await api.updateExisting({ dbName: this.dbName, collection: this.collection, filter, newData }))?.result || null;
};
// Permanent delete of the rows matching filter (the trash's purge).
NoticeModelDef.remove = async function (filter) {
  return (await api.delete({ dbName: this.dbName, collection: this.collection, filter }))?.result?.deletedCount || 0;
};

// One row per scheduled-job run: { job, date ("YYYY-MM-DD"), trigger, created, emailed, error, finishedAt }.
// A lock row { job, date, lockKey, lockedAt (Date) } claims one run slot across
// server processes (the alert job): lockKey is unique when set.
const JobRunModelDef = { dbName, collection: "JobRuns" };
JobRunModelDef.get = async function (filter = {}) {
  return await api.read({ dbName: this.dbName, collection: this.collection, filter });
};
JobRunModelDef.create = async function (data) {
  return await api.create({ dbName: this.dbName, collection: this.collection, data });
};

// api.js never creates indexes; this makes a repeated dedupKey impossible even
// if two checks race. Manual notices have no dedupKey, hence the partial filter.
// A notice with an end date is deleted at its expireAt (rows without one stay);
// a notice moved to the trash gets one 30 days later (Notice.service).
async function ensureNoticeIndexes() {
  const collection = mongoose.connection.useDb(dbName, { useCache: true }).collection(NoticeModelDef.collection);
  await collection.createIndex({ dedupKey: 1 }, { unique: true, partialFilterExpression: { dedupKey: { $type: "string" } } });
  await collection.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 });
}

// Lock rows expire after 7 days; ordinary run rows (no lockKey) are kept.
const JOB_LOCK_TTL_SECONDS = 7 * 24 * 60 * 60;
const LOCK_ROWS = { partialFilterExpression: { lockKey: { $type: "string" } } };
const JOB_RUN_INDEXES = [
  { key: { lockKey: 1 }, options: { unique: true, ...LOCK_ROWS } },
  { key: { lockedAt: 1 }, options: { expireAfterSeconds: JOB_LOCK_TTL_SECONDS, ...LOCK_ROWS } },
];
async function ensureJobRunIndexes() {
  const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");
  await ensureIndexes(collectionOf(JobRunModelDef), JOB_RUN_INDEXES);
}

module.exports = { NoticeModelDef, JobRunModelDef, ensureNoticeIndexes, JOB_RUN_INDEXES, ensureJobRunIndexes };
