const express = require('express');
const multer = require('multer');
const router = express.Router();

const {
  getAllS, getOneS, putS, deleteS, postS, uploadPhoto
} = require('./Student.controller');

// alias
const { requireAuth: protect, requireRole: protectRole } = require('../../middleware/authMiddleware');
const mongoose = require('mongoose');


const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
// כל הנתיבים כאן מוגנים
router.use(protect);

// אדמין
// router.get('/public/:tz', getOneS);
router.get('/', getAllS);
router.get('/:tz', getOneS);
router.post('/', protectRole('ادارة', ''), postS);
router.put('/:tz', protectRole('ادارة', 'مرشد'), putS);
router.delete('/:tz', protectRole('ادارة'), deleteS);
router.post('/upload-photo/:tz', protectRole('ادارة', 'مرشد'),upload.single('file'), uploadPhoto);

module.exports = router;
