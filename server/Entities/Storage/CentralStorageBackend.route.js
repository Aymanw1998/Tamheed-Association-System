// Drop-in replacement for the remote "Central Storage" service that
// Storage.controller.js normally talks to over HTTP (CENTRAL_STORAGE_API_URL /
// CENTRAL_STORAGE_FILE_BASE_URL). Implements the exact same wire contract
// (same paths, same request/response shapes) but backed by Google Drive, so
// Storage.controller.js's business logic (permissions, sharing, metadata,
// path scoping) needs zero changes - only the env vars point here instead of
// the unreachable remote host.
const express = require("express");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const os = require("os");
const path = require("path");
const { StorageModelDef } = require("./Storage.model");
const googleDrive = require("../../services/googleDrive.service");

const router = express.Router();

const DEFAULT_DB_NAME = process.env.DB_NAME || "tamheed_db";
const DEFAULT_COLLECTION = process.env.STORAGE_COLLECTION || "root";

const STORAGE_SIGNED_URL_SECRET =
  process.env.STORAGE_SIGNED_URL_SECRET ||
  process.env.JWT_ACCESS_SECRET ||
  (process.env.NODE_ENV === "production" ? "" : "storage-temp-secret");

const CHUNK_TMP_DIR = path.join(os.tmpdir(), "tamheed-drive-chunks");
fs.mkdirSync(CHUNK_TMP_DIR, { recursive: true });

const normalizeRelativePath = (value = "") =>
  String(value)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean)
    .join("/");

const splitFolderAndName = (relativePath = "") => {
  const safe = normalizeRelativePath(relativePath);
  const idx = safe.lastIndexOf("/");
  if (idx === -1) return { folder: "", name: safe };
  return { folder: safe.slice(0, idx), name: safe.slice(idx + 1) };
};

const joinStoragePath = (dbName, collection, folder) =>
  normalizeRelativePath(`${dbName}/${collection}/${folder || ""}`);

const driveFileToItem = (file, storageFolder) => {
  const isDirectory = file.mimeType === "application/vnd.google-apps.folder";
  return {
    relativePath: normalizeRelativePath(`${storageFolder}/${file.name}`),
    name: file.name,
    isDirectory,
    size: isDirectory ? null : Number(file.size) || 0,
    modifiedAt: file.modifiedTime || null,
    url: isDirectory ? null : googleDrive.toViewUrl(file.id),
    mimeType: isDirectory ? undefined : undefined,
  };
};

// ---- folder ----
router.post("/folder", express.json(), async (req, res) => {
  try {
    const { dbName, collection, folder } = req.body || {};
    const storagePath = joinStoragePath(dbName, collection, folder);
    await googleDrive.ensureFolderPath(storagePath);
    return res.json({ success: true, folder: storagePath });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ---- list ----
router.get("/list", async (req, res) => {
  try {
    const { dbName, collection, folder } = req.query || {};
    const storagePath = joinStoragePath(dbName, collection, folder);
    const children = await googleDrive.listChildren(storagePath);
    const items = children.map((file) => driveFileToItem(file, storagePath));
    return res.json({ success: true, items });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message, items: [] });
  }
});

// ---- stats ----
router.get("/stats", async (req, res) => {
  try {
    const quota = await googleDrive.getStorageQuota().catch(() => ({ limit: 0, usage: 0 }));
    const metadataResult = await StorageModelDef.get({}).catch(() => null);
    const metadataItems =
      metadataResult?.success && Array.isArray(metadataResult.result) ? metadataResult.result : [];
    const tamheedUsedBytes = metadataItems.reduce((sum, item) => sum + (Number(item?.size) || 0), 0);

    return res.json({
      success: true,
      serverTotalBytes: quota.limit,
      serverUsedBytes: quota.usage,
      serverFreeBytes: quota.limit ? Math.max(quota.limit - quota.usage, 0) : 0,
      tamheedUsedBytes,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ---- single-shot upload ----
const uploadTmpDir = path.join(os.tmpdir(), "tamheed-drive-uploads");
fs.mkdirSync(uploadTmpDir, { recursive: true });
const singleUpload = multer({ dest: uploadTmpDir });

router.post("/upload", singleUpload.single("file"), async (req, res) => {
  try {
    const { dbName, collection, folder } = req.body || {};
    if (!req.file) return res.status(400).json({ success: false, error: "file is required" });

    const storageFolder = joinStoragePath(dbName, collection, folder);
    const stream = fs.createReadStream(req.file.path);
    const uploaded = await googleDrive.uploadFile({
      body: stream,
      name: req.file.originalname,
      mimeType: req.file.mimetype,
      folderPath: storageFolder,
    });

    return res.status(201).json({
      success: true,
      filename: req.file.originalname,
      relativePath: normalizeRelativePath(`${storageFolder}/${req.file.originalname}`),
      url: uploaded.viewUrl,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  } finally {
    if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
  }
});

// ---- chunked upload ----
const chunkUpload = multer({ storage: multer.memoryStorage() });

const chunkDir = (uploadId) => path.join(CHUNK_TMP_DIR, uploadId);
const chunkFilePath = (uploadId, chunkIndex) => path.join(chunkDir(uploadId), `${chunkIndex}.part`);

router.post("/upload-chunk", chunkUpload.single("chunk"), async (req, res) => {
  try {
    const { uploadId, chunkIndex } = req.body || {};
    if (!req.file || !uploadId || chunkIndex === undefined) {
      return res.status(400).json({ success: false, error: "chunk, uploadId, chunkIndex required" });
    }

    await fs.promises.mkdir(chunkDir(uploadId), { recursive: true });
    await fs.promises.writeFile(chunkFilePath(uploadId, Number(chunkIndex)), req.file.buffer);

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/upload-status", async (req, res) => {
  // Storage.controller.js already tracks status locally and treats this
  // endpoint as best-effort (a 404 here is fine and expected).
  return res.status(404).json({ success: false, message: "not tracked" });
});

router.post("/cancel-upload", express.json(), async (req, res) => {
  try {
    const { uploadId } = req.body || {};
    if (uploadId) {
      await fs.promises.rm(chunkDir(uploadId), { recursive: true, force: true });
    }
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/merge-chunks", express.json(), async (req, res) => {
  const { dbName, collection, folder, uploadId, fileName, totalChunks, mimeType } = req.body || {};
  const mergedPath = path.join(CHUNK_TMP_DIR, `${uploadId}.merged`);

  try {
    if (!uploadId || !fileName || !totalChunks) {
      return res.status(400).json({ success: false, error: "uploadId, fileName, totalChunks required" });
    }

    const out = fs.createWriteStream(mergedPath);
    for (let index = 0; index < Number(totalChunks); index += 1) {
      const partPath = chunkFilePath(uploadId, index);
      await new Promise((resolve, reject) => {
        const inStream = fs.createReadStream(partPath);
        inStream.on("error", reject);
        inStream.on("end", resolve);
        inStream.pipe(out, { end: false });
      });
    }
    await new Promise((resolve) => out.end(resolve));

    const storageFolder = joinStoragePath(dbName, collection, folder);
    const stream = fs.createReadStream(mergedPath);
    const stat = await fs.promises.stat(mergedPath);
    const uploaded = await googleDrive.uploadFile({
      body: stream,
      name: fileName,
      mimeType: mimeType || "application/octet-stream",
      folderPath: storageFolder,
    });

    return res.status(201).json({
      success: true,
      fileName,
      filename: fileName,
      relativePath: normalizeRelativePath(`${storageFolder}/${fileName}`),
      url: uploaded.viewUrl,
      size: stat.size,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  } finally {
    await fs.promises.rm(chunkDir(uploadId), { recursive: true, force: true }).catch(() => {});
    await fs.promises.unlink(mergedPath).catch(() => {});
  }
});

// ---- resolve a storage-relative path to its Drive file/folder id ----
// Different Storage.controller.js code paths store StorageModelDef.relativePath
// with or without the "dbName/collection/" prefix (a pre-existing quirk, not
// something this backend controls), so metadata lookups try both forms
// before falling back to walking the real Drive tree.
const findMetadataByPath = async (candidatePaths) => {
  let fallback = null;

  for (const candidate of candidatePaths) {
    if (!candidate) continue;
    const result = await StorageModelDef.get({ relativePath: candidate }).catch(() => null);
    const match = result?.success && Array.isArray(result.result) ? result.result[0] : null;
    if (!match) continue;
    // Prefer a record that actually has a usable file URL (duplicate stub
    // records with no url can exist under other prefix variants).
    if (match.type === "file" && match.url) return match;
    if (!fallback) fallback = match;
  }

  return fallback;
};

const resolveDriveTarget = async (storageRelativePath, { dbName, collection } = {}) => {
  const prefix = dbName && collection ? `${dbName}/${collection}` : "";
  const hasPrefix = prefix && (storageRelativePath === prefix || storageRelativePath.startsWith(`${prefix}/`));
  const strippedPrefix = hasPrefix
    ? storageRelativePath.slice(prefix.length).replace(/^\/+/, "")
    : storageRelativePath;
  const withPrefix = hasPrefix ? storageRelativePath : joinStoragePath(dbName || "", collection || "", storageRelativePath);

  const metadata = await findMetadataByPath([storageRelativePath, strippedPrefix, withPrefix]);

  if (metadata?.type === "file" && metadata.url) {
    const fileId = googleDrive.extractFileId(metadata.url);
    if (fileId) return { fileId, isDirectory: false };
  }

  // Folder (or file metadata missing/stale) - resolve by walking the real
  // Drive tree, which is always laid out under dbName/collection/... .
  const folderCandidate = withPrefix || storageRelativePath;
  const { folderId } = await googleDrive.resolveFolderPath(folderCandidate);
  if (folderId) return { fileId: folderId, isDirectory: true };

  // Last resort: treat the final segment as a filename inside its parent
  // folder, in case metadata is missing entirely.
  const { folder, name } = splitFolderAndName(folderCandidate);
  const { folderId: parentId, drive } = await googleDrive.resolveFolderPath(folder);
  if (!parentId) return null;

  const safeName = String(name).replace(/'/g, "\\'");
  const found = await drive.files.list({
    q: `name = '${safeName}' and trashed = false and '${parentId}' in parents`,
    fields: "files(id, mimeType)",
    spaces: "drive",
  });
  const file = found.data.files?.[0];
  if (!file) return null;

  return {
    fileId: file.id,
    isDirectory: file.mimeType === "application/vnd.google-apps.folder",
  };
};

// ---- delete ----
router.delete("/delete", express.json(), async (req, res) => {
  try {
    const relativePath = normalizeRelativePath(req.body?.relativePath || "");
    if (!relativePath) return res.status(400).json({ success: false, error: "relativePath is required" });

    const target = await resolveDriveTarget(relativePath, { dbName: req.body?.dbName || DEFAULT_DB_NAME, collection: req.body?.collection || DEFAULT_COLLECTION });
    if (!target) return res.json({ success: true, deleted: false });

    await googleDrive.deleteById(target.fileId);
    return res.json({ success: true, deleted: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ---- rename ----
router.patch("/rename", express.json(), async (req, res) => {
  try {
    const relativePath = normalizeRelativePath(req.body?.relativePath || "");
    const newName = String(req.body?.newName || "").trim();
    if (!relativePath || !newName) {
      return res.status(400).json({ success: false, error: "relativePath and newName are required" });
    }

    const target = await resolveDriveTarget(relativePath, { dbName: req.body?.dbName || DEFAULT_DB_NAME, collection: req.body?.collection || DEFAULT_COLLECTION });
    if (!target) return res.status(404).json({ success: false, error: "not found" });

    await googleDrive.renameById(target.fileId, newName);
    const { folder } = splitFolderAndName(relativePath);
    const newRelativePath = normalizeRelativePath(`${folder}/${newName}`);

    return res.json({
      success: true,
      newRelativePath,
      relativePath: newRelativePath,
      name: newName,
      type: target.isDirectory ? "directory" : "file",
      url: target.isDirectory ? null : googleDrive.toViewUrl(target.fileId),
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ---- file serving (target of the signed open/download links) ----
router.get("/file/:name", async (req, res) => {
  try {
    const token = String(req.query?.token || "").trim();
    if (!token) return res.status(400).json({ success: false, error: "token is required" });

    const payload = jwt.verify(token, STORAGE_SIGNED_URL_SECRET, { algorithms: ["HS256"] });
    const storageRelativePath = normalizeRelativePath(payload?.path || "");
    if (!storageRelativePath) return res.status(400).json({ success: false, error: "invalid token" });

    const target = await resolveDriveTarget(storageRelativePath, { dbName: DEFAULT_DB_NAME, collection: DEFAULT_COLLECTION });
    if (!target || target.isDirectory) {
      return res.status(404).json({ success: false, error: "file not found" });
    }

    return res.redirect(302, googleDrive.toViewUrl(target.fileId));
  } catch (error) {
    const status = error?.name === "TokenExpiredError" || error?.name === "JsonWebTokenError" ? 401 : 500;
    return res.status(status).json({ success: false, error: error.message });
  }
});

module.exports = router;
