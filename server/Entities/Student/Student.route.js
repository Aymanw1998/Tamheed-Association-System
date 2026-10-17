const express = require('express');
const multer = require('multer');
const router = express.Router();

const {
  getAllS, getOneS, putS, deleteS, postS, uploadPhoto, deletePhoto,
} = require('./Student.controller');

// alias
const { requireAuth: protect } = require('../../middleware/authMiddleware');
const { loadActor, requirePermission } = require('../../middleware/permissionMiddleware');
const mongoose = require('mongoose');


const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
// ملاحظة عربية
router.use(protect, loadActor);

// الأحدالأربعاءجنس
// router.get('/public/:tz', getOneS);
router.get('/', requirePermission('students.view'), getAllS);
router.get('/:tz', requirePermission('students.view'), getOneS);
router.post('/', requirePermission('students.create'), postS);
router.put('/:tz', requirePermission('students.edit'), putS);
router.delete('/photo/:tz', requirePermission('students.photo'), deletePhoto);
router.delete('/:tz', requirePermission('students.delete'), deleteS);
router.post('/upload-photo/:tz', requirePermission('students.photo'), upload.single('file'), uploadPhoto);

module.exports = router;
