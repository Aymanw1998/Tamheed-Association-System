const express = require("express");
const multer = require("multer");
const router = express.Router();

const {
  getLink,
  rotateLink,
  validateToken,
  submitRegistration,
} = require("./InviteToken.controller");
const { requireAuth: protect, requireRole: protectRole } = require("../../middleware/authMiddleware");
const { rateLimit } = require("../../middleware/rateLimit");

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    const allowed = PHOTO_TYPES.has(file.mimetype);
    cb(allowed ? null : new Error("Unsupported photo type"), allowed);
  },
});

// Multer errors (size, type, extra files) become one Arabic 400 instead of
// the generic error handler's 500.
const acceptPhoto = (req, res, next) => {
  photoUpload.single("photo")(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        ok: false,
        code: "BAD_PHOTO",
        message: "الصورة يجب أن تكون JPG أو PNG أو WEBP وحتى 5MB",
      });
    }
    next();
  });
};

router.get("/link", protect, protectRole("ادارة"), getLink);
router.post("/link/rotate", protect, protectRole("ادارة"), rotateLink);

// Public: parents open these from the shared link without logging in.
router.get(
  "/validate/:token",
  rateLimit({ windowMs: 15 * 60 * 1000, max: 60, scope: "registration-validate" }),
  validateToken
);
router.post(
  "/submit/:token",
  rateLimit({ windowMs: 60 * 60 * 1000, max: 3, scope: "registration-submit" }),
  acceptPhoto,
  submitRegistration
);

module.exports = router;

// OLD CODE - DO NOT SUGGEST
// // routes/inviteRoutes.js
// const express = require('express');
// const crypto = require('crypto');
// const InviteToken = require('./InviteToken.model');
// const Student = require('../Student/Student.model');
// const { equal } = require('assert');
// const router = express.Router();

// router.post('/create-link', async (req, res) => {
//   try {
// ملاحظة عربية
//     const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 10 دقائق

//     await InviteToken.create({ token, expiresAt });

//     const origin = req.get('origin'); //|| process.env.CLIENT_URL || 'http://localhost:3000';
//     const url = `${origin}/parent-register?invite=${token}`;

//     res.status(200).json({ url});
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ url: null, message: 'Error creating link' });
//   }
// });

// // routes/inviteRoutes.js
// router.get('/validate/:token', async (req, res) => {
//   try {
//     const { token } = req.params;
//     const invite = await InviteToken.findOne({ token });
//     if (!invite) {
//       return res.status(400).json({ valid: false, reason: 'not_found' });
//     }

//     if (invite.used) {
//       return res.status(400).json({ valid: false, reason: 'already_used' });
//     }

//     if (invite.expiresAt < new Date()) {
//       return res.status(400).json({ valid: false, reason: 'expired' });
//     }
//     res.status(200).json({ valid: true });
//   } catch (err) {
//     res.status(500).json({ valid: false, reason: 'server_error' });
//   }
// });

// function toDate(value) {
//   if (!value) return null;
//   if (value instanceof Date) return value;
//   if (typeof value === 'number') return new Date(value);

//   if (typeof value === 'string') {
//     const s = value.trim();

//     // dd-mm-yyyy الأحدالجمعة dd/mm/yyyy
//     let m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
//     if (m) {
//       const [, dd, mm, yyyy] = m.map(Number);
// ملاحظة عربية
//     }

// ملاحظة عربية
//     m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
//     if (m) {
//       const [, yyyy, mm, dd] = m.map(Number);
//       return new Date(Date.UTC(yyyy, mm - 1, dd));
//     }

//     const ts = Date.parse(s);
//     if (!Number.isNaN(ts)) return new Date(ts);
//   }
// ملاحظة عربية
// }

// router.post('/submit/:token', async (req, res) => {
//   try {
//     const { token } = req.params;

//     const invite = await InviteToken.findOne({ token });
//     if (!invite || invite.used || invite.expiresAt < new Date()) {
//       return res.status(400).json({ message: 'Invalid or expired link' });
//     }

//     const body = req.body;
//     console.log("Invite submit body:", body, body.tz);
// ملاحظة عربية
//     const s = await Student.create({
//       tz: req.body.tz,
//       firstname: body.firstname,
//       lastname: body.lastname,
// ملاحظة عربية
//       gender: body.gender,
//       phone: body.phone,
//       email: body.email || "test@test.com",
//       city: body.city || "الرمة",
//       street: body.street || "الرملة القديمة",
//       father_name: body.father_name,
//       mother_name: body.mother_name,
//       father_phone: body.father_phone,
//       mother_phone: body.mother_phone,
//       source: 'اهل', status: 'ينتظر',
//     })
//     console.log("Created student from invite:", s);

//     invite.used = true;
//     await invite.save();

//     res.status(200).json({ message: 'Form submitted successfully' });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: 'Error submitting form' });
//   }
// });

// module.exports = router;
