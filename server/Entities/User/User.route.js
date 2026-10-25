const express = require('express');
const router = express.Router();
const multer = require('multer');

const {
  getAllU, uploadPhoto, deletePhoto, getOneU, putU, deleteU, postU, changeRoom, viewPassword, updateStoragePermissions,
  getPermissions, putPermissions, putRole, unlockUser, recoverSystem,
} = require('./User.controller');

// alias
const { requireAuth: protect } = require('../../middleware/authMiddleware');
const { loadActor, requirePermission, requireSelfOr } = require('../../middleware/permissionMiddleware');
const { rateLimit } = require('../../middleware/rateLimit');

// System account recovery emails a temporary password: at most 3 an hour.
// Placed after the permission check, so non-holders never use up the budget.
const recoverRateLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 3, scope: "system-recover" });
const mongoose = require('mongoose');
const { requireFreeOrMine } = require('../../middleware/lockGuard');
const { UserModelDef } = require('./User.model');

// The lock is on the user's _id; the routes name the user by tz (or _id), in any room.
const userKey = async (req) => {
  const ref = String(req.params.tz ?? '').trim();
  if (!ref) return null;
  for (const room of ['active', 'waiting', 'noActive']) {
    let found = await UserModelDef.get({ tz: ref }, room);
    if (!found?.result?.length) found = await UserModelDef.get({ _id: ref }, room).catch(() => null);
    const user = found?.result?.[0];
    if (user) return `user:${user._id}`;
  }
  return null;
};
const lockedUser = requireFreeOrMine(userKey);
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


// ملاحظة عربية
router.use(protect, loadActor);

// الأحدالأربعاءجنس
router.get('/', requirePermission('users.view'), getAllU);
router.get('/:tz', requireSelfOr('tz', 'users.view'), getOneU);
router.get('/viewPassword/:tz', requirePermission('users.passwords'), viewPassword);
// Roles and grants change only through these two endpoints.
router.get('/:tz/permissions', requirePermission('permissions.manage'), getPermissions);

router.post('/', requirePermission('users.create'), postU);
// Emails a temporary password to SYSTEM_ADMIN_EMAIL; never returns it.
router.post('/system/recover', requirePermission('systemRecovery.reset'), recoverRateLimit, recoverSystem);
router.post("/changeStatus/:tz", requirePermission('users.approve'), lockedUser, changeRoom);
router.post('/:tz/unlock', requirePermission('users.unlock'), lockedUser, unlockUser);
router.post('/upload-photo/:tz', requireSelfOr('tz', 'users.edit'), lockedUser, upload.single('file'), uploadPhoto);

router.patch('/:tz/storage-permissions', requirePermission('files.manageAll'), lockedUser, updateStoragePermissions);

router.put('/:tz/permissions', requirePermission('permissions.manage'), lockedUser, putPermissions);
router.put('/:tz/role', requirePermission('users.changeRole'), lockedUser, putRole);
router.put('/:tz', requireSelfOr('tz', 'users.edit'), lockedUser, putU);

router.delete('/photo/:tz', requireSelfOr('tz', 'users.edit'), lockedUser, deletePhoto);
router.delete('/:tz/:from', requirePermission('users.delete'), lockedUser, deleteU);


module.exports = router;
