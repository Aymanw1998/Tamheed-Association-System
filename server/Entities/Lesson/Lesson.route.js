// Entities/Lesson/Lesson.route.js
const express = require('express');
const router = express.Router();

const {
  getAll,
  getOne,
  getLessonsByQuery,
  postOne,
  putOne,
  deleteOne,
  addToList,
  removeFromList,
  copyMonth,
  deletePerMonth,
  getLessonsByToDay,
} = require('./Lesson.controller');

// ملاحظة عربية
const { requireAuth: protect, requireRole: protectRole } = require('../../middleware/authMiddleware');

// ملاحظة عربية
router.use(protect);

// ملاحظة عربية
router.get('/', getAll);
router.get('/query', getLessonsByQuery)
router.get('/today', getLessonsByToDay);
router.get('/:id', getOne);
// ملاحظة عربية
router.post('/addToList/:id', addToList);
router.post('/removeFromList/:id', removeFromList);

// ملاحظة عربية
// router.use(protectRole('ادارة'));

router.post('/', postOne);
router.put('/:id', putOne);
router.delete('/:id', deleteOne);
router.post('/copy-month', copyMonth);
router.delete('/delete-perMonth/:month/:year', deletePerMonth);
module.exports = router;
