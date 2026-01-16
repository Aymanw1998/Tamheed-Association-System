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
} = require('./User.controller'); // שים לב לאותיות קטנות/גדולות במערכת קבצים לינוקס

const { requireAuth, requireRole } = require('../../middleware/authMiddleware'); // לא authMiddleware
const { setEngine } = require('crypto');

// ---------- Public ----------
router.post('/register/', register);

// התחברות – מחזיר access + מציב refresh בקוקי
router.post('/login', login);

// יציאה – מנקה הקוקי ומבטל refresh במסד
router.post('/logout', requireAuth, logout);

// ---------- Protected ----------
// יציאה – מנקה הקוקי ומבטל refresh במסד
router.get('/me', requireAuth, getme);

// דוגמה להגנת תפקיד
router.get('/admin/ping', requireAuth, requireRole('ادارة'), (req, res) => res.json({ ok: true }));

// router.get('/see-password', requireAuth, viewPassword);

router.use(cookieParser());
// רענון – קורא מה-cookie, מנפיק access חדש, מסובב refresh
router.post('/refresh', refreshAccessToken);

router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

router.get("/google")
module.exports = router;
