const express = require('express');
const router = express.Router();
const {getAllU, putU, deleteU, } = require('./user.controller');

const { protect, protectRole } = require('../middleware/authMiddleware');

// ---------- Protected Routes ----------
router.get('/', protect, protectRole("System"), getAllU);
router.put('/', protect, putU);
router.delete('/:id', protect, protectRole("System"), deleteU);

module.exports = router;
