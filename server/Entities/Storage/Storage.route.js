const express = require("express");
const fs = require("fs");
const multer = require("multer");
const os = require("os");
const path = require("path");
const {
  cancelUpload,
  createFolder,
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
const { loadActor, requirePermission } = require("../../middleware/permissionMiddleware");
const { rateLimit } = require("../../middleware/rateLimit");

const router = express.Router();
const storageUploadRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, scope: "storage-upload" });
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

// Every signed-in route needs files.use; per-path checks stay in the controller.
router.get("/", requireAuth, loadActor, requirePermission("files.use"), listStorage);
router.get("/list", requireAuth, loadActor, requirePermission("files.use"), listStorage);
router.get("/stats", requireAuth, loadActor, requirePermission("files.use"), getStorageStats);
router.get("/open", requireAuth, loadActor, requirePermission("files.use"), openEntry);
router.get("/download", requireAuth, loadActor, requirePermission("files.use"), openEntry);
router.get("/open-signed", openSignedEntry);
router.get("/download-signed", openSignedEntry);
router.post("/open-link", requireAuth, loadActor, requirePermission("files.use"), getSignedOpenLink);
router.get("/share-status", requireAuth, loadActor, requirePermission("files.use"), getShareStatus);
router.get("/share-link/:token", requireAuth, loadActor, requirePermission("files.use"), getShareLinkInfo);
router.get("/share-link/:token/items", requireAuth, loadActor, requirePermission("files.use"), listSharedLinkItems);
router.post("/share-link/:token/open-link", requireAuth, loadActor, requirePermission("files.use"), getSharedLinkOpenLink);
router.post("/folder", requireAuth, loadActor, requirePermission("files.use"), createFolder);
router.get("/upload-status", requireAuth, loadActor, requirePermission("files.use"), getUploadStatus);
router.post("/cancel-upload", requireAuth, loadActor, requirePermission("files.use"), express.json({ limit: "1mb" }), cancelUpload);
router.post("/upload-chunk", requireAuth, loadActor, requirePermission("files.use"), storageUploadRateLimit, chunkUpload.single("chunk"), uploadChunk);
router.post("/merge-chunks", requireAuth, loadActor, requirePermission("files.use"), storageUploadRateLimit, express.json({ limit: "5mb" }), mergeChunks);
router.post("/upload", requireAuth, loadActor, requirePermission("files.use"), storageUploadRateLimit, uploadSingleFile, uploadFile);
router.post("/share", requireAuth, loadActor, requirePermission("files.use"), shareEntry);
router.post("/unshare", requireAuth, loadActor, requirePermission("files.use"), unshareEntry);
router.patch("/rename", requireAuth, loadActor, requirePermission("files.use"), renameFile);
router.post("/rename", requireAuth, loadActor, requirePermission("files.use"), renameFile);
router.delete("/delete", requireAuth, loadActor, requirePermission("files.use"), deleteEntry);
router.delete("/*", requireAuth, loadActor, requirePermission("files.use"), deleteEntry);

module.exports = router;
