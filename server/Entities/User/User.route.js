const express = require('express');
const router = express.Router();
const multer = require('multer');

const {
  getAllU, uploadPhoto, deletePhoto, getOneU, putU, deleteU, postU, changeRoom, updateStoragePermissions,
  putRole, signOutEverywhere, getPermissions, putPermissions,
} = require('./User.controller');

// alias
const { requireAuth: protect } = require('../../middleware/authMiddleware');
const { loadActor, requirePermission, requireSelfOr, adminPowersGate } = require('../../middleware/permissionMiddleware');

const mongoose = require('mongoose');
const { requireFreeOrMine } = require('../../middleware/lockGuard');
const { UserModelDef } = require('./User.model');
const { isHiddenUser } = require('../../utils/permissions');

// The lock is on the user's _id; the routes name the user by tz (or _id), in any room.
const userKey = async (req) => {
  const ref = String(req.params.tz ?? '').trim();
  if (!ref) return null;
  for (const room of ['active', 'waiting', 'noActive']) {
    let found = await UserModelDef.get({ tz: ref }, room);
    if (!found?.result?.length) found = await UserModelDef.get({ _id: ref }, room).catch(() => null);
    const user = found?.result?.[0];
    if (!user) continue;
    // Who works unseen: no lock holder to report; the controller answers 404.
    if (req.actor?.it !== true && isHiddenUser(user) && String(user.tz) !== String(req.actor?.tz)) return null;
    return `user:${user._id}`;
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

router.post('/', requirePermission('users.create'), postU);
router.post("/changeStatus/:tz", requirePermission('users.approve'), lockedUser, changeRoom);
router.post('/:tz/sign-out-all', requirePermission('users.edit'), signOutEverywhere);
router.post('/upload-photo/:tz', requireSelfOr('tz', 'users.edit'), lockedUser, upload.single('file'), uploadPhoto);

router.patch('/:tz/storage-permissions', requirePermission('files.manageAll'), lockedUser, updateStoragePermissions);

// An administrator changes the permissions of those below him while IT's switch
// is on (validatePermissionChange checks each change).
router.get('/:tz/permissions', requirePermission('users.view'), adminPowersGate, getPermissions);
router.put('/:tz/permissions', requirePermission('users.view'), adminPowersGate, lockedUser, putPermissions);

router.put('/:tz/role', requirePermission('users.changeRole'), lockedUser, putRole);
router.put('/:tz', requireSelfOr('tz', 'users.edit'), lockedUser, putU);

router.delete('/photo/:tz', requireSelfOr('tz', 'users.edit'), lockedUser, deletePhoto);
router.delete('/:tz/:from', requirePermission('users.delete'), lockedUser, deleteU);


module.exports = router;
// The IT site's user routes take the same lock check (It.route.js).
module.exports.lockedUser = lockedUser;
