const api = require("../api");

const STORAGE_DB_NAME = process.env.DB_NAME || "tamheed_db";
const STORAGE_METADATA_COLLECTION = process.env.STORAGE_METADATA_COLLECTION || "Storage";

const normalizeSharedWith = (sharedWith = []) => {
  if (!Array.isArray(sharedWith)) return [];

  return sharedWith
    .map((entry) => ({
      userId: String(entry?.userId || "").trim(),
      role: String(entry?.role || "read").trim(),
    }))
    .filter((entry) => entry.userId);
};

const applyDefaults = (payload = {}) => {
  const now = new Date();

  return {
    type: payload.type || "file",
    name: String(payload.name || "").trim(),
    ownerId: String(payload.ownerId || "").trim(),
    relativePath: String(payload.relativePath || "").trim(),
    parentPath: String(payload.parentPath || "").trim(),
    url: payload.url || null,
    visibility: payload.visibility || "private",
    sharedWith: normalizeSharedWith(payload.sharedWith),
    mimeType: payload.mimeType || "",
    size: Number.isFinite(payload.size) ? payload.size : null,
    createdAt: payload.createdAt || now,
    updatedAt: payload.updatedAt || now,
  };
};

const StorageModelDef = {
  dbName: STORAGE_DB_NAME,

  collections: {
    active: STORAGE_METADATA_COLLECTION,
  },

  fields: {
    type: { type: "string", required: true, default: "file" },
    name: { type: "string", required: true, default: "" },
    ownerId: { type: "string", required: true, default: "" },
    relativePath: { type: "string", required: true, default: "" },
    parentPath: { type: "string", required: false, default: "" },
    url: { type: "string", required: false, default: null },
    visibility: { type: "string", required: false, default: "private" },
    sharedWith: { type: "array", required: false, default: [] },
    mimeType: { type: "string", required: false, default: "" },
    size: { type: "number", required: false, default: null },
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

StorageModelDef.get = async function (filter = {}) {
  return await api.read({
    dbName: this.dbName,
    collection: this.collections.active,
    filter,
  });
};

StorageModelDef.create = async function (data) {
  return await api.create({
    dbName: this.dbName,
    collection: this.collections.active,
    data: applyDefaults(data),
  });
};

StorageModelDef.update = async function (filter, newData) {
  return await api.update({
    dbName: this.dbName,
    collection: this.collections.active,
    filter,
    newData: {
      ...newData,
      sharedWith: newData?.sharedWith ? normalizeSharedWith(newData.sharedWith) : newData?.sharedWith,
      updatedAt: new Date(),
    },
  });
};

StorageModelDef.delete = async function (filter) {
  return await api.delete({
    dbName: this.dbName,
    collection: this.collections.active,
    filter,
  });
};

module.exports = {
  STORAGE_DB_NAME,
  STORAGE_METADATA_COLLECTION,
  normalizeSharedWith,
  applyDefaults,
  StorageModelDef,
};
