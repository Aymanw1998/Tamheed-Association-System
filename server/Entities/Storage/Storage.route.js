const express = require("express");
const multer = require("multer");
const {
  createFolder,
  deleteEntry,
  listStorage,
  renameFile,
  uploadFile,
} = require("./Storage.controller");
const { requireAuth } = require("../../middleware/authMiddleware");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

router.get("/", requireAuth, listStorage);
router.get("/list", requireAuth, listStorage);
router.post("/folder", requireAuth, createFolder);
router.post("/upload", requireAuth, upload.single("file"), uploadFile);
router.patch("/rename", requireAuth, renameFile);
router.post("/rename", requireAuth, renameFile);
router.delete("/delete", requireAuth, deleteEntry);
router.delete("/*", requireAuth, deleteEntry);

module.exports = router;
