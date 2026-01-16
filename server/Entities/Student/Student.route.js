const express = require('express');
const multer = require('multer');
const router = express.Router();

const {
  getAllS, getOneS, putS, deleteS, postS, uploadPhoto, generateStudentPDF, parentRegister
} = require('./Student.controller');

// alias
const { requireAuth: protect, requireRole: protectRole } = require('../../middleware/authMiddleware');
const mongoose = require('mongoose');

// ולידציית ObjectId בסיסית לפרמטרים
const requireObjectId = (param) => (req, res, next) => {
  const v = req.params[param];
  if (v && !mongoose.Types.ObjectId.isValid(v)) {
    return res.status(400).json({ code: 'BAD_ID', message: `${param} is not a valid ObjectId` });
  }
  next();
};

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
router.get('/generate-pdf/:tz', generateStudentPDF);
// כל הנתיבים כאן מוגנים
router.use(protect);

// אדמין
// router.get('/public/:tz', getOneS);
router.get('/', getAllS);
router.get('/:tz', getOneS);
router.post('/', protectRole('ادارة'), postS);
router.put('/:tz', putS);
router.delete('/:tz', protectRole('ادارة'), deleteS);
router.post('/upload-photo/:tz', protectRole('ادارة', 'מורה'),upload.single('file'), uploadPhoto);

module.exports = router;
