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
const { requireAuth: protect } = require('../../middleware/authMiddleware');
const { loadActor, requirePermission } = require('../../middleware/permissionMiddleware');

// ملاحظة عربية
router.use(protect, loadActor);

// ملاحظة عربية
router.get('/', requirePermission('lessons.view'), getAll);
router.get('/query', requirePermission('lessons.view'), getLessonsByQuery);
router.get('/today', requirePermission('lessons.view'), getLessonsByToDay);
router.get('/:id', requirePermission('lessons.view'), getOne);
// ملاحظة عربية
router.post('/addToList/:id', requirePermission('lessons.roster'), addToList);
router.post('/removeFromList/:id', requirePermission('lessons.roster'), removeFromList);

// ملاحظة عربية

router.post('/', requirePermission('lessons.create'), postOne);
router.put('/:id', requirePermission('lessons.edit'), putOne);
router.delete('/:id', requirePermission('lessons.delete'), deleteOne);
router.post('/copy-month', requirePermission('lessons.copyMonth'), copyMonth);
router.delete('/delete-perMonth/:month/:year', requirePermission('lessons.copyMonth'), deletePerMonth);
module.exports = router;
