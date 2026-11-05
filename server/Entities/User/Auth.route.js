// Entities/User/user.route.js
const express = require('express');
const router = express.Router();
const cookieParser = require("cookie-parser")
const {
  register,
  login,
  loginWithCode,
  refreshAccessToken,
  logout,
  getme,
  forgotPassword,
  resetPassword,
  changePassword,
  listMyDevices,
  signOutDevice,
  signOutOtherDevices,
} = require('./User.controller'); // ملاحظة عربية

const { requireAuth, requireAuthAllowingPasswordChange } = require('../../middleware/authMiddleware'); // عربيالأحد authMiddleware
const { loadActor, loadActorAllowingPasswordChange, requirePermission } = require('../../middleware/permissionMiddleware');
const { rateLimit } = require('../../middleware/rateLimit');
const sitePass = require('../It/sitePass');
const { setEngine } = require('crypto');

// Signing in has no limit per address (owner, 2026-11-05): a whole Wi-Fi shares one
// address. Guessing is stopped per account (utils/loginLockout.js).
const passwordResetRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 8, scope: "password-reset" });

// ---------- Public ----------
router.post('/register/', register);

// ملاحظة عربية
router.post('/login', login);
// The second step for an IT user with no role and for the system account.
router.post('/login-code', loginWithCode);

// A passkey in System (Entities/User/User.passkey.js): a fingerprint or face
// signs in with no ID number; saved while signed in.
const passkey = (name) => (req, res, next) => require('./User.passkey').userPasskeys()[name](req, res, next);
router.post('/passkey/login-options', passkey('loginOptions'));
router.post('/passkey/login', passkey('login'));
router.post('/passkey/register-options', requireAuth, loadActor, passkey('registerOptions'));
router.post('/passkey/register', requireAuth, loadActor, passkey('register'));

// IT site → everyday app: a one-time pass from POST /api/it/system-pass
// (Entities/It/sitePass.js) instead of the password; the everyday sign-in answer.
router.post('/login-pass', sitePass.loginToSystem);

// ملاحظة عربية
router.post('/logout', requireAuth, logout);

// Everyday app → IT site: a one-time pass for an IT user who is not blocked;
// the IT site still asks the email code.
router.post('/it-pass', requireAuth, loadActor, sitePass.itPass);

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
router.post('/refresh', refreshAccessToken);

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

// "My devices": any signed-in user, for their own sessions only.
router.get("/sessions", requireAuth, loadActor, listMyDevices);
router.post("/sessions/sign-out-others", requireAuth, loadActor, signOutOtherDevices);
router.delete("/sessions/:sid", requireAuth, loadActor, signOutDevice);

router.get("/google")
module.exports = router;
