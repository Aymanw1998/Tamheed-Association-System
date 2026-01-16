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
} = require('./Lesson.controller');

// alias כדי לשמור על protect/protectRole
const { requireAuth: protect, requireRole: protectRole } = require('../../middleware/authMiddleware');

// הגנה בסיסית לכל הראוטים תחת /api/lesson
router.use(protect);

// פתוח לכל משתמש מחובר
router.get('/', getAll);
router.get('/query', getLessonsByQuery)
router.get('/:id', getOne);
// פעולות שקשורות לרשימות/שיבוצים (מחוברים בלבד)
router.post('/addToList/:id', addToList);
router.post('/removeFromList/:id', removeFromList);

// מכאן והלאה — ادارة בלבד
// router.use(protectRole('ادارة'));

router.post('/', postOne);
router.put('/:id', putOne);
router.delete('/:id', deleteOne);
router.post('/copy-month', copyMonth);
router.delete('/delete-perMonth/:month/:year', deletePerMonth);
module.exports = router;
