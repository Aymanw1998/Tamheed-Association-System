const express = require('express');
const multer = require('multer');
const router = express.Router();

const {
  getAllS, getOneS, putS, deleteS, postS, uploadPhoto, deletePhoto, lookupS,
} = require('./Student.controller');

// alias
const { requireAuth: protect } = require('../../middleware/authMiddleware');
const { loadActor, requirePermission } = require('../../middleware/permissionMiddleware');
const { rateLimit } = require('../../middleware/rateLimit');
const mongoose = require('mongoose');

// Exact-tz lookups per signed-in account, so ID numbers cannot be swept.
const lookupRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, scope: 'student-lookup', keyFn: (req) => req.actor?.id });

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
// ملاحظة عربية
router.use(protect, loadActor);

// الأحدالأربعاءجنس
// router.get('/public/:tz', getOneS);
router.get('/', requirePermission('students.view'), getAllS);
// Exact-tz lookup to add a student to a roster; declared before /:tz.
router.get('/lookup/:tz', requirePermission('lessons.roster'), lookupRateLimit, lookupS);
router.get('/:tz', requirePermission('students.view'), getOneS);
router.post('/', requirePermission('students.create'), postS);
router.put('/:tz', requirePermission('students.edit'), putS);
router.delete('/photo/:tz', requirePermission('students.photo'), deletePhoto);
router.delete('/:tz', requirePermission('students.delete'), deleteS);
router.post('/upload-photo/:tz', requirePermission('students.photo'), upload.single('file'), uploadPhoto);

module.exports = router;
