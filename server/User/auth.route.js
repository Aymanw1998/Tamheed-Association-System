const express = require('express');
const router = express.Router();
const {
  register,
  login,
  refreshAccessToken,
  logout,
} = require('./user.controller');

const { protect, protectRole } = require('../middleware/authMiddleware');

// ---------- Public Routes ----------
router.post('/register', register);
router.post('/login', login);
router.get('/refresh', refreshAccessToken);
router.post('/logout', logout);

module.exports = router;
