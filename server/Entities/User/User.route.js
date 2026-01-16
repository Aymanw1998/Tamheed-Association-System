const express = require('express');
const router = express.Router();
const multer = require('multer');

const {
  getAllU, uploadPhoto, getOneU, putU, deleteU, postU,CheckPasswordisGood, changeRoom, generatePDF
} = require('./User.controller');

// alias
const { requireAuth: protect, requireRole: protectRole } = require('../../middleware/authMiddleware');
const mongoose = require('mongoose');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ולידציית ObjectId בסיסית לפרמטרים
const requireObjectId = (param) => (req, res, next) => {
  const v = req.params[param];
  if (v && !mongoose.Types.ObjectId.isValid(v)) {
    return res.status(400).json({ code: 'BAD_ID', message: `${param} is not a valid ObjectId` });
  }
  next();
};

router.get('/public/:tz', getOneU);
router.get('/generate-pdf/:tz', generatePDF);

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
