// Generic data-access layer used by every Entities/*.model.js file
// (create/read/update/delete against {dbName, collection}).
//
// This used to forward every call over HTTP to an external "Global Server",
// throwing on failure (the remote api.js did `throw normalizeError(error)`).
// It now talks directly to a local MongoDB instance via Mongoose, using one
// schema-less model per collection, but still throws on failure to match
// that original contract - callers throughout the codebase are written
// against it (bare `await X.create(...)` inside try/catch expecting the
// catch to fire, or `.catch(() => null)` on `.get(...)` calls).
const mongoose = require("mongoose");
const connectDB = require("../config/db");

let connectingPromise = null;
async function ensureConnected() {
  if (mongoose.connection.readyState === 1) return;
  if (!connectingPromise) connectingPromise = connectDB();
  await connectingPromise;
}

const genericSchema = new mongoose.Schema({}, { strict: false, minimize: false });
const modelCache = new Map();

function getModel(dbName, collection) {
  const key = `${dbName || "default"}::${collection}`;
  if (modelCache.has(key)) return modelCache.get(key);

  const connection = dbName
    ? mongoose.connection.useDb(dbName, { useCache: true })
    : mongoose.connection;
  const model = connection.model(collection, genericSchema, collection);
  modelCache.set(key, model);
  return model;
}

function toPlain(doc) {
  if (!doc) return doc;
  const obj = typeof doc.toObject === "function" ? doc.toObject() : doc;
  if (obj._id) obj._id = String(obj._id);
  return obj;
}

const api = {
  async create({ dbName, collection, data }) {
    await ensureConnected();
    const Model = getModel(dbName, collection);
    const created = await Model.create(data);
    return { success: true, result: toPlain(created) };
  },

  async read({ dbName, collection, filter = {} }) {
    await ensureConnected();
    const Model = getModel(dbName, collection);
    const docs = await Model.find(filter).lean();
    const result = docs.map(toPlain);
    return { success: true, result, count: result.length };
  },

  // NOTE: upserts by design - most callers use this to set fields on a
  // record they know exists (by tz/_id/etc), and a couple of flows
  // (Attendance bulkSave) rely on it creating the row if it's missing.
  async update({ dbName, collection, filter, newData }) {
    await ensureConnected();
    const Model = getModel(dbName, collection);
    const updated = await Model.findOneAndUpdate(
      filter,
      { $set: newData },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return { success: true, result: toPlain(updated) };
  },

  async delete({ dbName, collection, filter }) {
    await ensureConnected();
    const Model = getModel(dbName, collection);
    const result = await Model.deleteMany(filter);
    return { success: true, result: { deletedCount: result.deletedCount } };
  },
};

module.exports = api;
