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
  addUsers,
  removeUsers,
  addableUsersList,
  myParticipations,
  copyMonth,
  deletePerMonth,
  getLessonsByToDay,
} = require('./Lesson.controller');

// ملاحظة عربية
const { requireAuth: protect } = require('../../middleware/authMiddleware');
const { loadActor, requirePermission } = require('../../middleware/permissionMiddleware');
const { requireFreeOrMine } = require('../../middleware/lockGuard');
const { objectIdParam } = require('../../middleware/objectIdParam');

// Every /:id route answers 404 for an id that is not an ObjectId.
router.param('id', objectIdParam);

// Writes to one lesson (its form and its roster) share the key lesson:<id>.
const lockedLesson = requireFreeOrMine((req) => (req.params.id ? `lesson:${req.params.id}` : null));

// ملاحظة عربية
router.use(protect, loadActor);

// ملاحظة عربية
router.get('/', requirePermission('lessons.view'), getAll);
router.get('/week-schedule', requirePermission('lessons.view'), requirePermission('calendar.view'), getAll);
router.get('/query', requirePermission('lessons.view'), getLessonsByQuery);
router.get('/today', requirePermission('lessons.view'), getLessonsByToDay);
router.get('/sport-schedule', requirePermission('lessons.view'), requirePermission('calendar.view'), getSportSchedule);
// One's own participations (any signed-in user; filtered by his id).
router.get('/participating', myParticipations);
router.get('/:id/addable-users', requirePermission('lessons.staffRoster'), addableUsersList);
router.get('/:id', requirePermission('lessons.view'), getOne);
// ملاحظة عربية
router.post('/addToList/:id', requirePermission('lessons.roster'), lockedLesson, addToList);
router.post('/removeFromList/:id', requirePermission('lessons.roster'), lockedLesson, removeFromList);
// Users (staff) as participants (owner, 2026-11-09).
router.post('/addUsers/:id', requirePermission('lessons.staffRoster'), lockedLesson, addUsers);
router.post('/removeUsers/:id', requirePermission('lessons.staffRoster'), lockedLesson, removeUsers);

// ملاحظة عربية

router.post('/', requirePermission('lessons.create'), postOne);
router.put('/:id', requirePermission('lessons.edit'), lockedLesson, putOne);
router.delete('/:id', requirePermission('lessons.delete'), lockedLesson, deleteOne);
router.post('/copy-month', requirePermission('lessons.copyMonth'), copyMonth);
router.delete('/delete-perMonth/:month/:year', requirePermission('lessons.copyMonth'), deletePerMonth);
module.exports = router;
