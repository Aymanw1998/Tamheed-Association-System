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
  changePassword,
} = require('./User.controller'); // ملاحظة عربية

const { requireAuth, requireAuthAllowingPasswordChange } = require('../../middleware/authMiddleware'); // عربيالأحد authMiddleware
const { loadActor, loadActorAllowingPasswordChange, requirePermission } = require('../../middleware/permissionMiddleware');
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
// No loadActor here: getme answers USER_NOT_FOUND for a user who left the
// active room, which the client uses to reset to the login page.
router.post('/me', requireAuth, getme);

// ملاحظة عربية
router.get('/admin/ping', requireAuth, loadActor, requirePermission('users.view'), (req, res) => res.json({ ok: true }));

// router.get('/see-password', requireAuth, viewPassword);

router.use(cookieParser());
// ملاحظة عربية
router.post('/refresh', rateLimit({ windowMs: 60 * 1000, max: 60, scope: "auth-refresh" }), refreshAccessToken);

router.post("/forgot-password", passwordResetRateLimit, forgotPassword);
router.post("/reset-password", passwordResetRateLimit, resetPassword);

// Any signed-in user; the only route a "password-change" token (expired
// system password) is accepted on. Rate-limited: it checks the current password.
router.post(
  "/change-password",
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10, scope: "password-change" }),
  requireAuthAllowingPasswordChange,
  loadActorAllowingPasswordChange,
  changePassword,
);

router.get("/google")
module.exports = router;
