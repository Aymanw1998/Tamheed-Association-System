// Entities/Lesson/Lesson.route.js
const express = require('express');
const router = express.Router();

const {
  getAll,
  getOne,
  getAttendancesByQuery,
  getAllByLessonDayMonthYear,
  postOne,
  postByLessonDayMonthYear,
  getHistory,
  putOne,
  deleteOne,
  deletePerMonth,
} = require('./Attendance.controller');

// alias כדי לשמור על protect/protectRole
const { requireAuth: protect, requireRole: protectRole } = require('../../middleware/authMiddleware');

// הגנה בסיסית לכל הראוטים תחת /api/lesson
router.use(protect);

// פתוח לכל משתמש מחובר
router.get('/', getAttendancesByQuery);
router.get('/history', getHistory);
router.get('/:id', getOne);
router.get('/:lesson_id/:day/:month/:year', getAllByLessonDayMonthYear);
router.post('/ByList/:lesson_id/:day/:month/:year', postByLessonDayMonthYear);
// מכאן והלאה — ادارة בלבד
// router.use(protectRole('ادارة'));

router.post('/', postOne);
router.put('/:id', putOne);
router.delete('/:id', deleteOne);
router.delete('/delete-perMonth/:month/:year', deletePerMonth);
module.exports = router;
