// routes/drive.files.routes.js
const express = require("express");
const multer = require("multer");
const { getDriveClient } = require("./google.service");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/upload", upload.single("file"), async (req, res, next) => {
  try {
    // TODO: جيب توكنات المستخدم من DB
    const tokens = req.user.googleTokens; // مثال

    const drive = getDriveClient({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    });

    const file = req.file;
    if (!file) return res.status(400).json({ message: "No file uploaded" });

    const createRes = await drive.files.create({
      requestBody: { name: file.originalname },
      media: { mimeType: file.mimetype, body: Buffer.from(file.buffer) },
      fields: "id,name,mimeType,webViewLink,webContentLink",
    }); // create/upload :contentReference[oaicite:5]{index=5}

    res.json(createRes.data);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
