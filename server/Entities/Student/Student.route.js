const express = require('express');
const multer = require('multer');
const router = express.Router();

const {
  getAllS, getOneS, putS, deleteS, postS, uploadPhoto, deletePhoto,
} = require('./Student.controller');

// alias
const { requireAuth: protect, requireRole: protectRole } = require('../../middleware/authMiddleware');
const mongoose = require('mongoose');


const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
// ملاحظة عربية
router.use(protect);

// الأحدالأربعاءجنس
// router.get('/public/:tz', getOneS);
router.get('/', getAllS);
router.get('/:tz', getOneS);
router.post('/', protectRole('ادارة', ''), postS);
router.put('/:tz', protectRole('ادارة', 'مرشد'), putS);
router.delete('/photo/:tz', deletePhoto);
router.delete('/:tz', protectRole('ادارة'), deleteS);
router.post('/upload-photo/:tz', protectRole('ادارة', 'مرشد'),upload.single('file'), uploadPhoto);

module.exports = router;
