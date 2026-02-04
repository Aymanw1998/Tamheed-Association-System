const mongoose = require('mongoose');

const bcrypt = require('bcryptjs');
const { UserInterface } = require('../Person/Person.interface');
const { isEncrypted } = require('./passwordCrypto'); // עדכן נתיב לפי הפרויקט שלך


const UserSchema = new mongoose.Schema({
  ...UserInterface,  
  resetOtpHash: { type: String },
  resetOtpExpires: { type: Date },
  resetOtpAttempts: { type: Number, default: 0 },
  resetOtpLockedUntil: { type: Date },
  googleDrive: {
    connected: { type: Boolean, default: false },
    refreshToken: { type: String },
    accessToken: { type: String },
    expiryDate: { type: Number }, // ms timestamp
    folderId: { type: String },   // תיקייה ב-Drive
    folderName: { type: String },
  },

}, {timestamps: true} );
UserSchema.index({ tz: 1 }, { unique: true });
// השוואת סיסמה
UserSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

const isBcryptHash = (val) =>
  typeof val === 'string' && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(val);

// השוואת סיסמה: כאן נשאיר רק bcrypt, כי ב-login נבצע switch לפי פורמט
UserSchema.methods.comparePasswordBcrypt = function (plain) {
  return bcrypt.compare(plain, this.password);
};

// לפני save: אם זה כבר bcrypt או enc - לא נוגעים
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  if (isBcryptHash(this.password)) return next();
  if (isEncrypted(this.password)) return next();

  // אם הגיע plaintext "בטעות" – נשמור כ-bcrypt (fallback)
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// לפני update: אם זה כבר bcrypt או enc - לא נוגעים
UserSchema.pre(['findOneAndUpdate', 'updateOne'], async function (next) {
  const update = this.getUpdate() || {};
  const pwd = update.password ?? update.$set?.password;

  if (pwd == null || pwd === '') {
    if (update.password) delete update.password;
    if (update.$set) delete update.$set.password;
    return next();
  }

  if (isBcryptHash(pwd) || isEncrypted(pwd)) return next();

  // fallback: plaintext -> bcrypt
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(pwd, salt);

  if (update.password) update.password = hash;
  if (update.$set) update.$set.password = hash;
  next();
});

const User = mongoose.model('Users', UserSchema);
const UsernoActive = mongoose.model('UsersnoActive', UserSchema);
const UserWaitingRoom = mongoose.model('UsersWaitingRoom', UserSchema);
module.exports = {User, UsernoActive, UserWaitingRoom};
