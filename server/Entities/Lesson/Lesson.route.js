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
router.post('/addToList/:id', protectRole('ادارة', 'مرشد'), addToList);
router.post('/removeFromList/:id', protectRole('ادارة', 'مرشد'), removeFromList);

// ملاحظة عربية
// router.use(protectRole('ادارة'));

router.post('/', protectRole('ادارة', 'مرشد'), postOne);
router.put('/:id', protectRole('ادارة', 'مرشد'), putOne);
router.delete('/:id', protectRole('ادارة'), deleteOne);
router.post('/copy-month', protectRole('ادارة'), copyMonth);
router.delete('/delete-perMonth/:month/:year', protectRole('ادارة'), deletePerMonth);
module.exports = router;
