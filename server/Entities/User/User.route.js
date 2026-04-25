const express = require('express');
const router = express.Router();
const multer = require('multer');

const {
  getAllU, uploadPhoto, deletePhoto, getOneU, putU, deleteU, postU,CheckPasswordisGood, changeRoom, viewPassword, updateStoragePermissions
} = require('./User.controller');

// alias
const { requireAuth: protect, requireRole: protectRole } = require('../../middleware/authMiddleware');
const mongoose = require('mongoose');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


router.get('/public/:tz', getOneU);
router.post("/changeStatus/:tz", changeRoom);
// כל הנתיבים כאן מוגנים
router.use(protect);

// אדמין
router.get('/', getAllU);
router.get('/:tz', getOneU);
router.get('/viewPassword/:tz', viewPassword);

router.post('/', protectRole('ادارة'), postU);
router.post("/checkPasswordisGood", CheckPasswordisGood);
//router.post("/changeStatus/:tz", protectRole('ادارة'), changeRoom);
router.post('/upload-photo/:tz', upload.single('file'), uploadPhoto);

router.patch('/:tz/storage-permissions', protectRole('ادارة'), updateStoragePermissions);

router.put('/:tz', putU);

router.delete('/photo/:tz', deletePhoto);
router.delete('/:tz/:from', protectRole('ادارة'), deleteU);


module.exports = router;
