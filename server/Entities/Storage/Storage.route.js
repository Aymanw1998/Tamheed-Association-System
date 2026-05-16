const express = require("express");
const fs = require("fs");
const multer = require("multer");
const os = require("os");
const path = require("path");
const {
  cancelUpload,
  createFolder,
  createShareLink,
  deleteEntry,
  getShareStatus,
  getShareLinkInfo,
  getSharedLinkOpenLink,
  getStorageStats,
  getSignedOpenLink,
  getUploadStatus,
  listSharedLinkItems,
  listStorage,
  mergeChunks,
  openEntry,
  openSignedEntry,
  renameFile,
  shareEntry,
  unshareEntry,
  uploadChunk,
  uploadFile,
} = require("./Storage.controller");
const { requireAuth } = require("../../middleware/authMiddleware");

const router = express.Router();
const uploadTempDir = path.join(os.tmpdir(), "tamheed-storage-uploads");
const configuredUploadMaxMb = Number(process.env.STORAGE_UPLOAD_MAX_MB || 2048);
const uploadMaxMb = Number.isFinite(configuredUploadMaxMb)
  ? Math.max(configuredUploadMaxMb, 2048)
  : 2048;

fs.mkdirSync(uploadTempDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadTempDir),
    filename: (req, file, cb) => {
      const safeName = String(file.originalname || "file")
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .replace(/_+/g, "_");
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`);
    },
  }),
  limits: {
    fileSize: uploadMaxMb * 1024 * 1024,
  },
});

const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.STORAGE_CHUNK_MAX_MB || 60) * 1024 * 1024,
  },
});

const uploadSingleFile = (req, res, next) => {
  upload.single("file")(req, res, (error) => {
    console.log("Upload result:", { error});
    if (!error) return next();

    if (error.code === "LIMIT_FILE_SIZE") {
      console.log("File too large:", { fileSize: req.file?.size, uploadMaxMb, error });
      return res.status(413).json({
        success: false,
        message: `الملف كبير جدًا. الحد الأقصى للرفع هو ${uploadMaxMb}MB`,
      });
    }

    return next(error);
  });
};

router.get("/", requireAuth, listStorage);
router.get("/list", requireAuth, listStorage);
router.get("/stats", requireAuth, getStorageStats);
router.get("/open", requireAuth, openEntry);
router.get("/download", requireAuth, openEntry);
router.get("/open-signed", openSignedEntry);
router.get("/download-signed", openSignedEntry);
router.post("/open-link", requireAuth, getSignedOpenLink);
router.get("/share-status", requireAuth, getShareStatus);
router.post("/share-link", requireAuth, createShareLink);
router.get("/share-link/:token", requireAuth, getShareLinkInfo);
router.get("/share-link/:token/items", requireAuth, listSharedLinkItems);
router.post("/share-link/:token/open-link", requireAuth, getSharedLinkOpenLink);
router.post("/folder", requireAuth, createFolder);
router.get("/upload-status", requireAuth, getUploadStatus);
router.post("/cancel-upload", requireAuth, express.json({ limit: "1mb" }), cancelUpload);
router.post("/upload-chunk", requireAuth, chunkUpload.single("chunk"), uploadChunk);
router.post("/merge-chunks", requireAuth, express.json({ limit: "5mb" }), mergeChunks);
router.post("/upload", requireAuth, uploadSingleFile, uploadFile);
router.post("/share", requireAuth, shareEntry);
router.post("/unshare", requireAuth, unshareEntry);
router.patch("/rename", requireAuth, renameFile);
router.post("/rename", requireAuth, renameFile);
router.delete("/delete", requireAuth, deleteEntry);
router.delete("/*", requireAuth, deleteEntry);

module.exports = router;
