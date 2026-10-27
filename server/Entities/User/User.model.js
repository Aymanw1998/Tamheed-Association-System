const api = require("../api");
const { encryptPassword, isEncrypted } = require('./passwordCrypto');
const { sanitizeVehiclePermissions } = require('../../utils/vehicleRules');
const isBcryptHash = (val) =>
  typeof val === 'string' && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(val);

// ملاحظة عربية
const UserModelDef = {
  dbName: 'tamheed_db',

  collections: {
    active: 'Users',
    noActive: 'UsersNoActive',
    waiting: 'UsersWaitingRoom',
  },

  fields: {
    tz: { type: 'string', required: true },
    firstname: { type: 'string', required: false, default: '' },
    lastname: { type: 'string', required: false, default: '' },
    birth_date: { type: 'date', required: false, default: null },
    gender: { type: 'string', required: false, default: '' },
    phone: { type: 'string', required: false, default: '' },
    email: { type: 'string', required: false, default: 'test@test.com' },
    city: { type: 'string', required: false, default: 'الرملة' },
    street: { type: 'string', required: false, default: 'الرملة القديمة' },
    password: {
      type: 'string',
      required: true,
      transform: (value) => {
        if (!value) return value;
        if (isBcryptHash(value)) return value;
        if (isEncrypted(value)) return value;

        // ملاحظة عربية
        return encryptPassword(value);

        // ملاحظة عربية
      },
    },
    roles: { type: 'array', required: false, default: [] },
    role: { type: 'string', required: false, default: null },
    permissionGrants: { type: 'array', required: false, default: [] },
    permissionRevokes: { type: 'array', required: false, default: [] },
    permissionsUpdatedAt: { type: 'date', required: false },
    permissionsUpdatedBy: { type: 'string', required: false },
    passwordChangedAt: { type: 'date', required: false, default: null },
    // Set by a system account recovery: ends older sessions, starts a cooldown.
    recoveredAt: { type: 'date', required: false, default: null },
    // Vehicles & trailers section: none of these is implied by a role. Only an
    // administrator can grant them (see utils/vehicleRules PERMISSIONS).
    vehiclePermissions: {
      type: 'array',
      required: false,
      default: [],
      transform: (value) => sanitizeVehiclePermissions(value),
    },
    // Product-tour progress: server-owned, written only by the tour routes.
    tours: { type: 'object', required: false, default: {} },
    // null = never seeded (no "new feature" tours for the first sign-in).
    knownKeys: { type: 'array', required: false, default: null },
    seenReleases: { type: 'array', required: false, default: [] },
    main_lesson: { type: 'string', required: false, default: null },
    storageFolder: { type: 'string', required: false, default: null },
    storagePermissions: {
      type: 'object',
      required: false,
      default: {
        view: [],
        create: [],
        update: [],
        delete: [],
      },
    },

    resetOtpHash: { type: 'string', required: false, default: null },
    resetOtpExpires: { type: 'date', required: false, default: null },
    resetOtpAttempts: { type: 'number', required: false, default: 0 },
    failedLoginCount: { type: 'number', required: false, default: 0 },
    lockedAt: { type: 'date', required: false, default: null },
    resetOtpLockedUntil: { type: 'date', required: false, default: null },

    updatedBy: { type: 'string', required: false },
    updatedByName: { type: 'string', required: false },

    createdAt: {
      type: 'date',
      required: false,
      default: () => new Date(),
    },
    updatedAt: {
      type: 'date',
      required: false,
      default: () => new Date(),
    },
  },
};

function applyFieldTransforms(fields = {}, payload = {}) {
  const transformed = { ...payload };

  Object.entries(fields).forEach(([fieldName, config]) => {
    if (!Object.prototype.hasOwnProperty.call(transformed, fieldName)) return;
    if (typeof config?.transform !== 'function') return;

    transformed[fieldName] = config.transform(transformed[fieldName], transformed);
  });

  return transformed;
}

// ملاحظة عربية

// Build for getting all users
/**
 * 
 * ملاحظة عربية
 * ملاحظة عربية
 * @returns 
 */
UserModelDef.get = async function (filter = {}, collection = 'active') {
  return await api.read({
    dbName: this.dbName,
    collection: this.collections[collection] || this.collections.active,
    filter,
  });
};

//Build for creating a user
/**
 * 
 * ملاحظة عربية
 * ملاحظة عربية
 * @returns 
 */
UserModelDef.create = async function (data, collection = 'active') {
  const transformedData = applyFieldTransforms(this.fields, data);

  return await api.create({
    dbName: this.dbName,
    collection: this.collections[collection] || this.collections.active,
    data: transformedData,
  });
};

//Build for updating a user
/**
 * 
 * ملاحظة عربية
 * ملاحظة عربية
 * ملاحظة عربية
 * @returns
 */
UserModelDef.update = async function (filter, newData, collection = 'active') {
  const transformedData = applyFieldTransforms(this.fields, newData);

  return await api.update({
    dbName: this.dbName,
    collection: this.collections[collection] || this.collections.active,
    filter,
    newData: transformedData
  });
};

// Like update() but never creates a user: result is null when no row matches.
UserModelDef.updateExisting = async function (filter, newData, collection = 'active') {
  const transformedData = applyFieldTransforms(this.fields, newData);

  return await api.updateExisting({
    dbName: this.dbName,
    collection: this.collections[collection] || this.collections.active,
    filter,
    newData: transformedData
  });
};

// Atomically add 1 to failedLoginCount and return the updated user.
UserModelDef.incrementFailedLogin = async function (tz, collection = 'active') {
  return await api.increment({
    dbName: this.dbName,
    collection: this.collections[collection] || this.collections.active,
    filter: { tz },
    field: 'failedLoginCount',
    by: 1,
  });
};

// Set lockedAt only if the account is not locked yet and the counter has
// reached the threshold (the filter is the guard; never upserts).
UserModelDef.lockIfThresholdReached = async function (tz, lockedAt, threshold, collection = 'active') {
  return await api.updateExisting({
    dbName: this.dbName,
    collection: this.collections[collection] || this.collections.active,
    filter: { tz, lockedAt: null, failedLoginCount: { $gte: threshold } },
    newData: { lockedAt },
  });
};

//Build for deleting a user
/**
 * 
 * ملاحظة عربية
 * ملاحظة عربية
 * @returns 
 */
UserModelDef.delete = async function (filter, collection = 'active') {
  return await api.delete({
    dbName: this.dbName,
    collection: this.collections[collection] || this.collections.active,
    filter,
  });
}
// Every write empties loadActor's short user cache (services/actorCache), so a
// role, permission, lockout or password change applies to the next request.
const { clearActors } = require("../../services/actorCache");
for (const name of ["create", "update", "updateExisting", "incrementFailedLogin", "lockIfThresholdReached", "delete"]) {
  const write = UserModelDef[name];
  UserModelDef[name] = async function (...args) {
    try {
      return await write.apply(this, args);
    } finally {
      clearActors();
    }
  };
}

module.exports = { UserModelDef};

// OLD CODE - DO NOT SUGGEST
// const mongoose = require('mongoose');

// const bcrypt = require('bcryptjs');
// const { UserInterface } = require('../Person/Person.interface');
// ملاحظة عربية


// const UserSchema = new mongoose.Schema({
//   ...UserInterface,  
//   resetOtpHash: { type: String },
//   resetOtpExpires: { type: Date },
//   resetOtpAttempts: { type: Number, default: 0 },
//   resetOtpLockedUntil: { type: Date },
//   googleDrive: {
//     connected: { type: Boolean, default: false },
//     refreshToken: { type: String },
//     accessToken: { type: String },
//     expiryDate: { type: Number }, // ms timestamp
// ملاحظة عربية
//     folderName: { type: String },
//   },

// }, {timestamps: true} );
// UserSchema.index({ tz: 1 }, { unique: true });
// // الخميسالسبتالجمعةالجمعةالأحدعربي كلمة مرور
// UserSchema.methods.comparePassword = function (plain) {
//   return bcrypt.compare(plain, this.password);
// };

// const isBcryptHash = (val) =>
//   typeof val === 'string' && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(val);

// ملاحظة عربية
// UserSchema.methods.comparePasswordBcrypt = function (plain) {
//   return bcrypt.compare(plain, this.password);
// };

// ملاحظة عربية
// UserSchema.pre('save', async function (next) {
//   if (!this.isModified('password')) return next();

//   if (isBcryptHash(this.password)) return next();
//   if (isEncrypted(this.password)) return next();

// ملاحظة عربية
//   const salt = await bcrypt.genSalt(10);
//   this.password = await bcrypt.hash(this.password, salt);
//   next();
// });

// ملاحظة عربية
// UserSchema.pre(['findOneAndUpdate', 'updateOne'], async function (next) {
//   const update = this.getUpdate() || {};
//   const pwd = update.password ?? update.$set?.password;

//   if (pwd == null || pwd === '') {
//     if (update.password) delete update.password;
//     if (update.$set) delete update.$set.password;
//     return next();
//   }

//   if (isBcryptHash(pwd) || isEncrypted(pwd)) return next();

//   // fallback: plaintext -> bcrypt
//   const salt = await bcrypt.genSalt(10);
//   const hash = await bcrypt.hash(pwd, salt);

//   if (update.password) update.password = hash;
//   if (update.$set) update.$set.password = hash;
//   next();
// });

// const User = mongoose.model('Users', UserSchema);
// const UsernoActive = mongoose.model('UsersnoActive', UserSchema);
// const UserWaitingRoom = mongoose.model('UsersWaitingRoom', UserSchema);
// module.exports = {User, UsernoActive, UserWaitingRoom};
