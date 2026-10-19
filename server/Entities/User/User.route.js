const express = require('express');
const router = express.Router();
const multer = require('multer');

const {
  getAllU, uploadPhoto, deletePhoto, getOneU, putU, deleteU, postU, changeRoom, viewPassword, updateStoragePermissions,
  getPermissions, putPermissions, putRole, unlockUser,
} = require('./User.controller');

// alias
const { requireAuth: protect } = require('../../middleware/authMiddleware');
const { loadActor, requirePermission, requireSelfOr } = require('../../middleware/permissionMiddleware');
const mongoose = require('mongoose');
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
router.post("/changeStatus/:tz", requirePermission('users.approve'), changeRoom);
router.post('/:tz/unlock', requirePermission('users.unlock'), unlockUser);
router.post('/upload-photo/:tz', requireSelfOr('tz', 'users.edit'), upload.single('file'), uploadPhoto);

router.patch('/:tz/storage-permissions', requirePermission('files.manageAll'), updateStoragePermissions);

router.put('/:tz/permissions', requirePermission('permissions.manage'), putPermissions);
router.put('/:tz/role', requirePermission('users.changeRole'), putRole);
router.put('/:tz', requireSelfOr('tz', 'users.edit'), putU);

router.delete('/photo/:tz', requireSelfOr('tz', 'users.edit'), deletePhoto);
router.delete('/:tz/:from', requirePermission('users.delete'), deleteU);


module.exports = router;
