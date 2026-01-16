const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const {
  listInRoot,
  uploadToRoot,
  downloadFileStream,
  deleteFile,
  createFolder,
  rename,
} = require("../../utils/driveService");

const router = express.Router();

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({ dest: uploadDir });

// LIST
router.get("/list", async (req, res) => {
  try {
    const files = await listInRoot();
    res.json({ ok: true, data: files });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

// UPLOAD
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, msg: "No file" });

    const data = await uploadToRoot(req.file.path, req.file.originalname);

    // ניקוי זמני
    fs.unlink(req.file.path, () => {});
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

// DOWNLOAD
router.get("/download/:id", async (req, res) => {
  try {
    const { meta, stream } = await downloadFileStream(req.params.id);

    res.setHeader("Content-Type", meta.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${meta.name}"`);

    stream.on("error", (err) => {
      res.status(500).end(err.message);
    });

    stream.pipe(res);
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

// DELETE
router.delete("/:id", async (req, res) => {
  try {
    await deleteFile(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

// CREATE FOLDER
router.post("/folder", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ ok: false, msg: "Missing name" });

    const data = await createFolder(name);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

// RENAME
router.patch("/:id/rename", async (req, res) => {
  try {
    const { newName } = req.body;
    if (!newName) return res.status(400).json({ ok: false, msg: "Missing newName" });

    const data = await rename(req.params.id, newName);
    res.json({ ok: true, data });
  } catch (e) {
    res.status(500).json({ ok: false, msg: e.message });
  }
});

module.exports = router;
