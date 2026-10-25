// Entities/Lesson/Lesson.route.js
const express = require('express');
const router = express.Router();

const {
  getAll,
  getOne,
  getLessonsByQuery,
  getSportSchedule,
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
const { requireAuth: protect } = require('../../middleware/authMiddleware');
const { loadActor, requirePermission } = require('../../middleware/permissionMiddleware');
const { requireFreeOrMine } = require('../../middleware/lockGuard');

// Writes to one lesson (its form and its roster) share the key lesson:<id>.
const lockedLesson = requireFreeOrMine((req) => (req.params.id ? `lesson:${req.params.id}` : null));

// ملاحظة عربية
router.use(protect, loadActor);

// ملاحظة عربية
router.get('/', requirePermission('lessons.view'), getAll);
router.get('/query', requirePermission('lessons.view'), getLessonsByQuery);
router.get('/today', requirePermission('lessons.view'), getLessonsByToDay);
router.get('/sport-schedule', requirePermission('lessons.view'), getSportSchedule);
router.get('/:id', requirePermission('lessons.view'), getOne);
// ملاحظة عربية
router.post('/addToList/:id', requirePermission('lessons.roster'), lockedLesson, addToList);
router.post('/removeFromList/:id', requirePermission('lessons.roster'), lockedLesson, removeFromList);

// ملاحظة عربية

router.post('/', requirePermission('lessons.create'), postOne);
router.put('/:id', requirePermission('lessons.edit'), lockedLesson, putOne);
router.delete('/:id', requirePermission('lessons.delete'), lockedLesson, deleteOne);
router.post('/copy-month', requirePermission('lessons.copyMonth'), copyMonth);
router.delete('/delete-perMonth/:month/:year', requirePermission('lessons.copyMonth'), deletePerMonth);
module.exports = router;
