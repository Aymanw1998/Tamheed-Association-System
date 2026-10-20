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
// api.update upserts, so callers must have loaded the notice first.
NoticeModelDef.update = async function (filter, newData) {
  return await api.update({ dbName: this.dbName, collection: this.collection, filter, newData });
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
async function ensureNoticeIndexes() {
  await mongoose.connection
    .useDb(dbName, { useCache: true })
    .collection(NoticeModelDef.collection)
    .createIndex({ dedupKey: 1 }, { unique: true, partialFilterExpression: { dedupKey: { $type: "string" } } });
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
