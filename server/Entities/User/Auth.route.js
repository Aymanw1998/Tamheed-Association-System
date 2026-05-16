// Entities/User/user.route.js
const express = require('express');
const router = express.Router();
const cookieParser = require("cookie-parser")
const {
  register,
  login,
  refreshAccessToken,
  logout,
  getme,
  forgotPassword,
  resetPassword,
} = require('./User.controller'); // ملاحظة عربية

const { requireAuth, requireRole } = require('../../middleware/authMiddleware'); // عربيالأحد authMiddleware
const { setEngine } = require('crypto');

// ---------- Public ----------
router.post('/register/', register);

// ملاحظة عربية
router.post('/login', login);

// ملاحظة عربية
router.post('/logout', requireAuth, logout);

// ---------- Protected ----------
// ملاحظة عربية
router.post('/me', requireAuth, getme);

// ملاحظة عربية
router.get('/admin/ping', requireAuth, requireRole('ادارة'), (req, res) => res.json({ ok: true }));

// router.get('/see-password', requireAuth, viewPassword);

router.use(cookieParser());
// ملاحظة عربية
router.post('/refresh', refreshAccessToken);

router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

router.get("/google")
module.exports = router;
