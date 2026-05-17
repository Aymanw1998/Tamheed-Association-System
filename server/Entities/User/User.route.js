const express = require('express');
const router = express.Router();
const multer = require('multer');

const {
  getAllU, uploadPhoto, deletePhoto, getOneU, putU, deleteU, postU,CheckPasswordisGood, changeRoom, viewPassword, updateStoragePermissions
} = require('./User.controller');

// alias
const {
  requireAuth: protect,
  requireRole: protectRole,
  requireSelfOrRole: protectSelfOrRole,
} = require('../../middleware/authMiddleware');
const mongoose = require('mongoose');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


// ملاحظة عربية
router.use(protect);

// الأحدالأربعاءجنس
router.get('/', protectRole('ادارة'), getAllU);
router.get('/:tz', protectSelfOrRole('tz', 'ادارة'), getOneU);
router.get('/viewPassword/:tz', viewPassword);

router.post('/', protectRole('ادارة'), postU);
router.post("/checkPasswordisGood", CheckPasswordisGood);
router.post("/changeStatus/:tz", protectRole('ادارة'), changeRoom);
router.post('/upload-photo/:tz', upload.single('file'), uploadPhoto);

router.patch('/:tz/storage-permissions', protectRole('ادارة'), updateStoragePermissions);

router.put('/:tz', protectSelfOrRole('tz', 'ادارة'), putU);

router.delete('/photo/:tz', deletePhoto);
router.delete('/:tz/:from', protectRole('ادارة'), deleteU);


module.exports = router;
