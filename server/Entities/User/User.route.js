const express = require('express');
const router = express.Router();
const multer = require('multer');

const {
  getAllU, uploadPhoto, getOneU, putU, deleteU, postU,CheckPasswordisGood, changeRoom,
} = require('./User.controller');

// alias
const { requireAuth: protect, requireRole: protectRole } = require('../../middleware/authMiddleware');
const mongoose = require('mongoose');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


router.get('/public/:tz', getOneU);

// כל הנתיבים כאן מוגנים
router.use(protect);

// אדמין
router.get('/', getAllU);
router.get('/:tz', getOneU);
router.post('/', protectRole('ادارة'), postU);
router.put('/:tz', putU);
router.delete('/:tz/:from', protectRole('ادارة'), deleteU);
router.post("/checkPasswordisGood", CheckPasswordisGood);
router.post("/changeStatus/:tz", protectRole('ادارة'), changeRoom);
router.post('/upload-photo/:tz', protectRole('ادارة', 'מורה'),upload.single('file'), uploadPhoto);

module.exports = router;
