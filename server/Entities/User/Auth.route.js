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
const { rateLimit } = require('../../middleware/rateLimit');
const { setEngine } = require('crypto');

const authRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, scope: "auth" });
const passwordResetRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 8, scope: "password-reset" });

// ---------- Public ----------
router.post('/register/', register);

// ملاحظة عربية
router.post('/login', authRateLimit, login);

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
router.post('/refresh', rateLimit({ windowMs: 60 * 1000, max: 60, scope: "auth-refresh" }), refreshAccessToken);

router.post("/forgot-password", passwordResetRateLimit, forgotPassword);
router.post("/reset-password", passwordResetRateLimit, resetPassword);

router.get("/google")
module.exports = router;
