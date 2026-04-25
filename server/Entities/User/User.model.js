const api = require("../api");
const { encryptPassword, isEncrypted } = require('./passwordCrypto');
const isBcryptHash = (val) =>
  typeof val === 'string' && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(val);

// Model definition - לא mongoose אלא הגדרה גנרית שנוכל להשתמש בה עם כל DB
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
    city: { type: 'string', required: false, default: 'الرمة' },
    street: { type: 'string', required: false, default: 'الرملة القديمة' },
    password: {
      type: 'string',
      required: true,
      transform: (value) => {
        if (!value) return value;
        if (isBcryptHash(value)) return value;
        if (isEncrypted(value)) return value;

        // אם את רוצה enc
        return encryptPassword(value);

        // או אם את רוצה bcrypt במקום זה, תעשי פה hash ידני
      },
    },
    roles: { type: 'array', required: false, default: [] },
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
    resetOtpLockedUntil: { type: 'date', required: false, default: null },

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

// Build functions for the model - פונקציות עזר לביצוע פעולות נפוצות על המודל

// Build for getting all users
/**
 * 
 * @param {*} filter | אופציונלי - פילטר לקריאה, לדוגמה { city: 'الرمة' } 
 * @param {*} collection | אופציונלי - מאיזה collection לקרוא, לדוגמה 'active' או 'waiting' או 'noActive'. ברירת מחדל: 'active'
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
 * @param {*} data | אובייקט עם שדות המשתמש ליצירה, לדוגמה { tz: '123456789', firstname: 'Ayman', password: 'plaintext' } 
 * @param {*} collection | אופציונלי - באיזה collection ליצור, לדוגמה 'active' או 'waiting' או 'noActive'. ברירת מחדל: 'active'
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
 * @param {*} filter | אובייקט עם שדות לפילטר, לדוגמה { tz: '123456789' } 
 * @param {*} newData | אובייקט עם שדות לעדכון, לדוגמה { city: 'תל אביב' }
 * @param {*} collection | אופציונלי - באיזה collection לעדכן, לדוגמה 'active' או 'waiting' או 'noActive'. ברירת מחדל: 'active'
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

//Build for deleting a user
/**
 * 
 * @param {*} filter | אובייקט עם שדות לפילטר, לדוגמה { tz: '123456789' }
 * @param {*} collection | אופציונלי - מאיזה collection למחוק, לדוגמה 'active' או 'waiting' או 'noActive'. ברירת מחדל: 'active'
 * @returns 
 */
UserModelDef.delete = async function (filter, collection = 'active') {
  return await api.delete({
    dbName: this.dbName,
    collection: this.collections[collection] || this.collections.active,
    filter,
  });
}
module.exports = { UserModelDef};

// OLD CODE - DO NOT SUGGEST
// const mongoose = require('mongoose');

// const bcrypt = require('bcryptjs');
// const { UserInterface } = require('../Person/Person.interface');
// const { isEncrypted } = require('./passwordCrypto'); // עדכן נתיב לפי הפרויקט שלך


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
//     folderId: { type: String },   // תיקייה ב-Drive
//     folderName: { type: String },
//   },

// }, {timestamps: true} );
// UserSchema.index({ tz: 1 }, { unique: true });
// // השוואת סיסמה
// UserSchema.methods.comparePassword = function (plain) {
//   return bcrypt.compare(plain, this.password);
// };

// const isBcryptHash = (val) =>
//   typeof val === 'string' && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(val);

// // השוואת סיסמה: כאן נשאיר רק bcrypt, כי ב-login נבצע switch לפי פורמט
// UserSchema.methods.comparePasswordBcrypt = function (plain) {
//   return bcrypt.compare(plain, this.password);
// };

// // לפני save: אם זה כבר bcrypt או enc - לא נוגעים
// UserSchema.pre('save', async function (next) {
//   if (!this.isModified('password')) return next();

//   if (isBcryptHash(this.password)) return next();
//   if (isEncrypted(this.password)) return next();

//   // אם הגיע plaintext "בטעות" – נשמור כ-bcrypt (fallback)
//   const salt = await bcrypt.genSalt(10);
//   this.password = await bcrypt.hash(this.password, salt);
//   next();
// });

// // לפני update: אם זה כבר bcrypt או enc - לא נוגעים
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
