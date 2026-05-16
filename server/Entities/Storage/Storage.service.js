const axios = require("axios");
const FormData = require("form-data");
const path = require("path");

const STORAGE_DB_NAME = process.env.DB_NAME || "tamheed_db";
const STORAGE_COLLECTION = process.env.STORAGE_COLLECTION || "root";
const STORAGE_API_BASE_URL = (
  `${process.env.API_URI}/api/storage`
).replace(/\/+$/, "");

const normalizeRelativePath = (value = "") => {
  return String(value)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .join("/");
};

const buildStoragePayload = (folder = "") => ({
  dbName: STORAGE_DB_NAME,
  collection: STORAGE_COLLECTION,
  folder: normalizeRelativePath(folder),
});

const getStorageAxios = () =>
  axios.create({
    baseURL: STORAGE_API_BASE_URL,
    timeout: 30000,
  });

const uploadToGlobalStorage = async ({ file, folder = "", fileName = "" }) => {
  const client = getStorageAxios();
  const form = new FormData();

  form.append("file", file.buffer, {
    filename: fileName || file.originalname || path.basename(file.path || "file"),
    contentType: file.mimetype || "application/octet-stream",
  });

  const payload = buildStoragePayload(folder);
  form.append("dbName", payload.dbName);
  form.append("collection", payload.collection);
  form.append("folder", payload.folder);

  const response = await client.post("/upload", form, {
    headers: form.getHeaders(),
  });

  return response.data;
};

const createFolderInGlobalStorage = async ({ folder = "" }) => {
  const client = getStorageAxios();
  const response = await client.post("/folder", buildStoragePayload(folder));
  return response.data;
};

const renameInGlobalStorage = async ({ oldRelativePath, newRelativePath }) => {
  const client = getStorageAxios();
  const response = await client.patch("/rename", {
    dbName: STORAGE_DB_NAME,
    collection: STORAGE_COLLECTION,
    oldRelativePath: normalizeRelativePath(oldRelativePath),
    newRelativePath: normalizeRelativePath(newRelativePath),
  });
  return response.data;
};

const deleteInGlobalStorage = async ({ relativePath }) => {
  const client = getStorageAxios();
  const response = await client.delete("/delete", {
    data: {
      relativePath: `${STORAGE_DB_NAME}/${STORAGE_COLLECTION}/${normalizeRelativePath(relativePath)}`,
    },
  });
  return response.data;
};

const listFromGlobalStorage = async ({ folder = "" }) => {
  const client = getStorageAxios();
  const response = await client.get("/list", {
    params: buildStoragePayload(folder),
  });
  return response.data;
};

module.exports = {
  STORAGE_API_BASE_URL,
  STORAGE_DB_NAME,
  STORAGE_COLLECTION,
  normalizeRelativePath,
  buildStoragePayload,
  uploadToGlobalStorage,
  createFolderInGlobalStorage,
  renameInGlobalStorage,
  deleteInGlobalStorage,
  listFromGlobalStorage,
};
