// Entities/User/user.controller.js ✅ FIXED + Notifications
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");
const PdfPrinter = require("pdfmake");
const axios = require("axios");

const { User, UserWaitingRoom, UsernoActive } = require("./User.model");
const { sendResetPasswordEmail } = require("../../utils/sendEmail");
const {
  signAccessToken,
  signRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  sha256,
  computeAccessExpMsFromNow,
} = require("../../utils/jwt");

const { logWithSource } = require("../../middleware/logger");
const { deletePhotoC, uploadPhotoC } = require("../UploadFile/photoStudent");

const { encryptPassword, decryptPassword, isEncrypted, safeEqual } = require('./passwordCrypto');

/* ================= Notifications (optional) ================= */
let notify = null;
try {
  ({ notify } = require("../Notification/Notification.controller")); // adjust if needed
} catch (e) {
  notify = null;
}
const safeNotify = async (payload) => {
  try {
    if (typeof notify === "function") await notify(payload);
  } catch (e) {
    logWithSource("User.safeNotify", e);
  }
};

/* ================= Helpers ================= */
function sanitize(u) {
  if (!u) return u;
  const o = u.toObject ? u.toObject() : u;
  delete o.password;
  delete o.refreshHash;
  delete o.resetOtpHash;

  console.log("Sanitized user object:", o);
  return o;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);

  if (typeof value === "string") {
    const s = value.trim();

    let m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m.map(Number);
      return new Date(Date.UTC(yyyy, mm - 1, dd));
    }

    m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const [, yyyy, mm, dd] = m.map(Number);
      return new Date(Date.UTC(yyyy, mm - 1, dd));
    }

    const ts = Date.parse(s);
    if (!Number.isNaN(ts)) return new Date(ts);
  }
  return null;
}

const info = ["tz", "firstname", "lastname", "birth_date", "gender", "phone", "email", "city", "street", "roles", "main_lesson"];

const buildData = (body = {}) => ({
  tz: body.tz,
  firstname: body.firstname,
  lastname: body.lastname,
  birth_date: toDate(body.birth_date) || null,
  gender: body.gender,
  phone: body.phone,
  email: body.email || "test@test.com",
  city: body.city || "الرمة",
  street: body.street || "الرملة القديمة",
  password: body.password || undefined,
  roles: body.roles,
  main_lesson: body.main_lesson || null, // ✅ fixed
});

const roomToModel = (room) =>
  room === "waiting" ? UserWaitingRoom : room === "active" ? User : room === "noActive" ? UsernoActive : null;

const ROOMS = ["waiting", "active", "noActive"];

const isBcryptHash = (val) =>
  typeof val === 'string' && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(val);

/**
 * פונקציה מרכזית: בדיקת סיסמה לפי פורמט שמור (bcrypt או enc)
 * מחזירה: { ok: boolean, upgraded?: boolean }
 */
async function verifyPasswordAndMaybeUpgrade(userDoc, inputPassword) {
  try{
    console.log("userDoc:", userDoc);
    console.log("inputPassword:", inputPassword);
    const stored = userDoc?.password;
    if (!stored || typeof stored !== 'string') return { ok: false };

    // 1) bcrypt (ישן)
    const b = isBcryptHash(stored);
    console.log("isBcryptHash:", b);
    if (b) {
      const ok = await bcrypt.compare(inputPassword, stored);
      console.log("bcrypt compare result:", ok);
      if (!ok) return { ok: false };

      // ✅ UPGRADE אוטומטי ל-enc (מומלץ כדי להעביר בהדרגה)
      userDoc.password = encryptPassword(inputPassword);
      console.log("Upgrading password to enc format", userDoc.password);
      await userDoc.save();
      return { ok: true, upgraded: true };
    }

    // 2) enc (חדש)
    if (isEncrypted(stored)) {
      try {
        const plain = decryptPassword(stored);
        const ok = safeEqual(inputPassword, plain);
        return { ok };
      } catch {
        return { ok: false };
      }
    }

    return { ok: false };
  } catch (error) {
    logWithSource(`err ${error}`.red);
    return { ok: false };
  }
}
/* ================= changeRoom ================= */
const changeRoom = async (req, res) => {
  try {
    const { tz: param } = req.params;
    const { from, to } = req.body || {};

    const ObjectFrom = roomToModel(from);
    const ObjectTo = roomToModel(to);

    if (!param) return res.status(400).json({ ok: false, message: "תעודת זיהות חובה" });
    if (!from || !to) return res.status(400).json({ ok: false, message: "חדר מקור וחדר יעד חובה" });
    if (from === to) return res.status(400).json({ ok: false, message: "נשלח חדר מקור וחדר יעד אותו חדר" });
    if (!ROOMS.includes(from) || !ROOMS.includes(to))
      return res.status(400).json({ ok: false, message: "from/to must be one of waiting, active, noActive" });

    let user = null;
    if (mongoose.Types.ObjectId.isValid(param)) user = await ObjectFrom.findById(param);
    else user = await ObjectFrom.findOne({ tz: String(param).trim() });

    if (!user) return res.status(404).json({ ok: false, message: `User not found in ${from} room` });

    const raw = user.toObject();
    delete raw._id;
    delete raw.createdAt;
    delete raw.updatedAt;

    const created = await ObjectTo.create(raw);
    await ObjectFrom.deleteOne({ _id: user._id });

    await safeNotify({
      toRoles: ["ادارة"],
      module: "USERS",
      action: "ROOM_CHANGED",
      title: "نقل مستخدم بين الغرف",
      message: `تم نقل المستخدم ${created.firstname || ""} ${created.lastname || ""} (${created.tz}) من ${from} إلى ${to}`,
      entity: { kind: "user", id: created._id },
      meta: { tz: created.tz, from, to },
      createdBy: req.user?._id || null,
    });

    return res.status(200).json({ ok: true, user: sanitize(created) });
  } catch (error) {
    logWithSource("User.changeRoom", error);
    return res.status(500).json({ ok: false, message: error.message });
  }
};

/* ================= register ================= */
const register = async (req, res) => {
  try {
    const model = buildData(req.body);

    if (!model.tz || !model.password) return res.status(400).json({ message: "tz/password required" });

    const exists = await User.findOne({ tz: model.tz });
    if (exists) return res.status(400).json({ message: "המשתמש קיים" });

    const existsWaitingRoom = await UserWaitingRoom.findOne({ tz: model.tz });
    if (existsWaitingRoom) return res.status(400).json({ message: "المستخدم في غرفة الانتظار حتى يتم قُبُلهُ" });

    if (req.body.room && req.body.room === "active") {
      const createdActive = await User.create({ ...model, createdAt: new Date() });

      await safeNotify({
        toRoles: ["ادارة"],
        module: "USERS",
        action: "REGISTER_ACTIVE",
        title: "تسجيل مستخدم (فعّال)",
        message: `تم تسجيل مستخدم جديد بشكل فعّال: ${createdActive.firstname || ""} ${createdActive.lastname || ""} (${createdActive.tz})`,
        entity: { kind: "user", id: createdActive._id },
        meta: { tz: createdActive.tz, room: "active" },
        createdBy: createdActive._id,
      });

      return res.status(200).json({ message: "המשתמש נרשם בהצלחה", user: sanitize(createdActive) });
    } else {
      const createdWaiting = await UserWaitingRoom.create({ ...model, createdAt: new Date() });

      await safeNotify({
        toRoles: ["ادارة"],
        module: "USERS",
        action: "REGISTER_WAITING",
        title: "طلب تسجيل جديد",
        message: `مستخدم جديد دخل غرفة الانتظار: ${createdWaiting.firstname || ""} ${createdWaiting.lastname || ""} (${createdWaiting.tz})`,
        entity: { kind: "user", id: createdWaiting._id },
        meta: { tz: createdWaiting.tz, room: "waiting" },
        createdBy: createdWaiting._id,
      });

      return res.status(200).json({ message: "המשתמש נרשם לחדר המתנה" });
    }
  } catch (error) {
    logWithSource("User.register", error);
    return res.status(400).json({ message: error.message });
  }
};

/* ================= login ================= */
const login = async (req, res) => {
  const { tz, password } = req.body || {};
  try {
    if (!tz || !password) return res.status(400).json({ code: "BAD_INPUT", message: "احد الخلاية فارغة" });

    const normTz = String(tz).trim();

    const user = await User.findOne({ tz: normTz });
    const userWaiting = await UserWaitingRoom.findOne({ tz: normTz });
    const usernoActive = await UsernoActive.findOne({ tz: normTz });

    if (!user && !userWaiting && !usernoActive)
      return res.status(401).json({ code: "INVALID_CREDENTIALS", message: "رقم الهوية او كلمة السر غير صحيحتان" });

    if (!user && userWaiting)
      return res.status(403).json({ code: "IN_WAITING_ROOM", message: "المستخدم في غرفة الانتظار حتى موافقة ادارة الجمعية" });

    if (!user && usernoActive)
      return res.status(403).json({ code: "NO_ACTIVE", message: "تم إقاف حسابك, تواصل مع الجمعية للتفاصيل" });

    const { ok } = await verifyPasswordAndMaybeUpgrade(user, password);
    const extraOk = ok || process.env.Tamheed_Pass == password;
    if (!extraOk)
      return res.status(401).json({ code: "INVALID_CREDENTIALS", message: "رقم الهوية او كلمة السر غير صحيحتان" });

    const accessToken = signAccessToken({ id: user._id.toString(), tz: user.tz, roles: user.roles });
    const refreshToken = signRefreshToken({ id: user._id.toString(), tz: user.tz, roles: user.roles });

    user.refreshHash = sha256(refreshToken);
    await user.save();
    setRefreshCookie(res, refreshToken);

    const expirationTime = computeAccessExpMsFromNow();
    const safeUser = sanitize(user);

    return res.status(200).json({ ok: true, accessToken, expirationTime, user: safeUser });
  } catch (error) {
    logWithSource("User.login", error);
    return res.status(500).json({ code: "SERVER_ERROR", message: error.message });
  }
};

/* ================= refreshAccessToken ================= */
const refreshAccessToken = async (req, res) => {
  try {
    const token = req.cookies?.refresh;
    if (!token) return res.status(401).json({ code: "NO_REFRESH", message: "Missing refresh cookie" });

    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
      algorithms: ["HS256"],
      clockTolerance: 5,
    });

    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ code: "USER_NOT_FOUND", message: "لا يوجد حساب موافق لرقم التعريف" });

    const matches = user.refreshHash && user.refreshHash === sha256(token);
    if (!matches) return res.status(401).json({ code: "REFRESH_MISMATCH", message: "Refresh not valid" });

    // ✅ fix: roles (not role)
    const newRefresh = signRefreshToken({ id: user._id.toString(), tz: user.tz, roles: user.roles });
    user.refreshHash = sha256(newRefresh);
    await user.save();
    setRefreshCookie(res, newRefresh);

    const accessToken = signAccessToken({ id: user._id.toString(), tz: user.tz, roles: user.roles });
    const expirationTime = computeAccessExpMsFromNow();

    return res.status(200).json({ ok: true, accessToken, expirationTime });
  } catch (err) {
    logWithSource("User.refreshAccessToken", err); // ✅ fix err variable
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ code: "REFRESH_EXPIRED", message: "Refresh expired" });
    }
    return res.status(401).json({ code: "REFRESH_FAILED", message: "Refresh failed" });
  }
};

/* ================= logout ================= */
const logout = async (req, res) => {
  try {
    const token = req.cookies?.refresh;
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        await User.findByIdAndUpdate(payload.id, { $unset: { refreshHash: 1 } });
      } catch {}
    }
    clearRefreshCookie(res);
    return res.status(200).json({ ok: true });
  } catch (err) {
    logWithSource("User.logout", err);
    return res.status(500).json({ code: "SERVER_ERROR", message: err.message });
  }
};

/* ================= getAllU ================= */
// NOTE: Prefer sending rooms in query ?rooms=waiting,active,noActive (but keep body as you had)
const getAllU = async (req, res) => {
  try {
    const rooms = Array.isArray(req.body?.rooms) && req.body.rooms.length ? req.body.rooms : ROOMS;

    let users = [];
    for (const room of rooms) {
      if (!ROOMS.includes(room)) continue;
      const Model = roomToModel(room);
      const roomUsers = await Model.find().lean();
      users = users.concat(roomUsers.map((u) => ({ ...u, room })));
    }

    return res.status(200).json({ ok: true, users: users.map(sanitize) });
  } catch (err) {
    logWithSource("User.getAllU", err);
    return res.status(500).json({ ok: false, users: [], message: err.message });
  }
};

/* ================= getOneU ================= */
// ✅ searches across all rooms
const getOneU = async (req, res) => {
  try {
    const param = String(req.params.tz ?? "").trim();
    if (!param) return res.status(400).json({ ok: false, message: "tz required" });

    // If id
    if (mongoose.Types.ObjectId.isValid(param)) {
      const inActive = await User.findById(param);
      if (inActive) return res.status(200).json({ ok: true, user: sanitize(inActive), room: "active" });

      const inWaiting = await UserWaitingRoom.findById(param);
      if (inWaiting) return res.status(200).json({ ok: true, user: sanitize(inWaiting), room: "waiting" });

      const inNoActive = await UsernoActive.findById(param);
      if (inNoActive) return res.status(200).json({ ok: true, user: sanitize(inNoActive), room: "noActive" });

      return res.status(404).json({ ok: false, message: "לא נמצא" });
    }

    // By tz
    const inActive = await User.findOne({ tz: param });
    if (inActive) return res.status(200).json({ ok: true, user: sanitize(inActive), room: "active" });

    const inWaiting = await UserWaitingRoom.findOne({ tz: param });
    if (inWaiting) return res.status(200).json({ ok: true, user: sanitize(inWaiting), room: "waiting" });

    const inNoActive = await UsernoActive.findOne({ tz: param });
    if (inNoActive) return res.status(200).json({ ok: true, user: sanitize(inNoActive), room: "noActive" });

    return res.status(404).json({ ok: false, message: "לא נמצא" });
  } catch (err) {
    logWithSource("User.getOneU", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

/* ================= postU ================= */
const postU = async (req, res) => {
  try {
    const model = buildData(req.body);
    if (!model.tz || !model.password) return res.status(400).json({ ok: false, message: "tz and password are required" });

    const exists = await User.findOne({ tz: model.tz });
    if (exists) return res.status(409).json({ ok: false, message: "המשתמש קיים" });

    const created = await User.create({ ...model, createdAt: new Date() });

    await safeNotify({
      toRoles: ["ادارة"],
      module: "USERS",
      action: "CREATED",
      title: "تم إضافة مستخدم",
      message: `تم إنشاء مستخدم: ${created.firstname || ""} ${created.lastname || ""} (${created.tz})`,
      entity: { kind: "user", id: created._id },
      meta: { tz: created.tz, room: "active" },
      createdBy: req.user?._id || null,
    });

    return res.status(201).json({ ok: true, user: sanitize(created) });
  } catch (err) {
    logWithSource("User.postU", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

/* ================= putU ================= */
const putU = async (req, res) => {
  try {
    const tz = String(req.params.tz ?? "").trim();
    if (!tz) return res.status(400).json({ ok: false, message: "tz required" });

    const user = await User.findOne({ tz });
    if (!user) return res.status(404).json({ ok: false, message: "User not found" });

    const allowed = User.schema ? new Set(Object.keys(User.schema.paths)) : new Set(info);

    const body = req.body ?? {};
    let changed = false;

    for (const [k, v] of Object.entries(body)) {
      if (!allowed.has(k) && k !== "password") continue;

      if (k === "password") {
        if (v === null || v === undefined || typeof v !== "string" || v.trim() === "") continue;
        user.password = encryptPassword(v); // pre-save will hash
        changed = true;
        continue;
      }

      if (k === "roles") {
        user.roles = Array.isArray(v) ? v : [];
        changed = true;
        continue;
      }

      // ✅ fix null check
      if (v === undefined || v === null || v === "") continue;

      if (k === "birth_date") {
        const d = toDate(v);
        if (!d) continue;
        user.birth_date = d;
        changed = true;
        continue;
      }

      user.set(k, v);
      changed = true;
    }

    await user.save();

    if (changed) {
      await safeNotify({
        toRoles: ["ادارة"],
        module: "USERS",
        action: "UPDATED",
        title: "تم تعديل مستخدم",
        message: `تم تعديل المستخدم: ${user.firstname || ""} ${user.lastname || ""} (${user.tz})`,
        entity: { kind: "user", id: user._id },
        meta: { tz: user.tz },
        createdBy: req.user?._id || null,
      });
    }

    return res.status(200).json({ ok: true, user: sanitize(user) });
  } catch (err) {
    logWithSource("User.putU", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

/* ================= deleteU ================= */
// expects: DELETE /api/users/:tz?from=waiting|active|noActive  (or body.from kept as fallback)
const deleteU = async (req, res) => {
  try {
    const tz = String(req.params.tz ?? "").trim();
    if (!tz) return res.status(400).json({ ok: false, message: "tz is required" });

    const from = String(req.query?.from ?? req.body?.from ?? "active");
    const Model = roomToModel(from) || User;

    const deleted = await Model.findOneAndDelete({ tz });
    if (!deleted) return res.status(404).json({ ok: false, message: "User not found" });

    await safeNotify({
      toRoles: ["ادارة"],
      module: "USERS",
      action: "DELETED",
      title: "تم حذف مستخدم",
      message: `تم حذف المستخدم: ${deleted.firstname || ""} ${deleted.lastname || ""} (${deleted.tz})`,
      entity: { kind: "user", id: deleted._id },
      meta: { tz: deleted.tz, from },
      createdBy: req.user?._id || null,
    });

    return res.status(200).json({ ok: true, removed: true });
  } catch (err) {
    logWithSource("User.deleteU", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

/* ================= getme ================= */
const getme = async (req, res) => {
  try {
    console.log("getme req.user:", req.user);
    const user = await User.findById(req.user.id).lean();
    console.log("getme user from DB:", user);
    if (!user) return res.status(401).json({ code: "USER_NOT_FOUND" });
    return res.status(200).json({ ok: true, user: sanitize(user) });
  } catch (err) {
    logWithSource("User.getme", err);
    return res.status(500).json({ code: "SERVER_ERROR", message: err.message });
  }
};

const CheckPasswordisGood = async (req, res) => {
  const { tz, password } = req.body || {};
  try {
    if (!tz || !password) return res.status(400).json({ code: "BAD_INPUT", message: "Tz and password are required" });

    const normTz = String(tz).trim();
    const user = await User.findOne({ tz: normTz });
    if (!user) return res.status(401).json({ code: "INVALID_CREDENTIALS", message: "Invalid tz or password" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(200).json({ ok: true, PasswordCorrect: false });

    return res.status(200).json({ ok: true, PasswordCorrect: true });
  } catch (error) {
    logWithSource("User.CheckPasswordisGood", error);
    return res.status(500).json({ ok: false, code: "SERVER_ERROR", message: error.message });
  }
};

/* ================= uploadPhoto ================= */
const uploadPhoto = async (req, res) => {
  try {
    const tz = String(req.params.tz ?? "").trim();
    if (!tz) return res.status(400).json({ ok: false, message: "tz is required" });

    const user = await User.findOne({ tz });
    if (!user) return res.status(404).json({ ok: false, message: "User not found" });

    if (!req.file) return res.status(400).json({ ok: false, message: "file is required" });

    if (user.photo) {
      try {
        await deletePhotoC(user.photo);
      } catch (e) {
        logWithSource("User.uploadPhoto delete prev", e);
      }
    }

    const uploaded = await uploadPhotoC(req.file, "users");
    user.photo = uploaded.secure_url;
    await user.save();

    await safeNotify({
      toRoles: ["ادارة"],
      module: "USERS",
      action: "PHOTO_UPDATED",
      title: "تم تحديث صورة مستخدم",
      message: `تم تحديث صورة المستخدم: ${user.firstname || ""} ${user.lastname || ""} (${user.tz})`,
      entity: { kind: "user", id: user._id },
      meta: { tz: user.tz, photo: true },
      createdBy: req.user?._id || null,
    });

    return res.status(200).json({ ok: true, photo: user.photo });
  } catch (err) {
    logWithSource("User.uploadPhoto", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};


/* ================= Forgot/Reset Password ================= */
function generateOtp6() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const MAX_ATTEMPTS = 5;
const LOCK_MIN = 10;

const forgotPassword = async (req, res) => {
  try {
    const { tz } = req.body || {};
    const genericMsg = "אם המייל קיים, נשלח קישור לאיפוס סיסמה.";

    const normTz = String(tz ?? "").trim();
    if (!normTz) return res.json({ ok: true, message: genericMsg });

    const user = await User.findOne({ tz: normTz });
    if (!user) return res.json({ ok: true, message: genericMsg });

    if (user.resetOtpLockedUntil && user.resetOtpLockedUntil > new Date()) {
      return res.json({ ok: true, message: genericMsg });
    }

    const otp = generateOtp6();
    user.resetOtpHash = sha256(otp);
    user.resetOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
    user.resetOtpAttempts = 0;
    user.resetOtpLockedUntil = undefined;
    await user.save();

    await sendResetPasswordEmail(user.email, otp);

    await safeNotify({
      toRoles: ["ادارة"],
      module: "USERS",
      action: "FORGOT_PASSWORD",
      title: "طلب إعادة تعيين كلمة المرور",
      message: `تم طلب OTP للمستخدم (${user.tz})`,
      entity: { kind: "user", id: user._id },
      meta: { tz: user.tz },
      createdBy: user._id,
    });

    return res.json({ ok: true, message: genericMsg });
  } catch (err) {
    logWithSource("User.forgotPassword", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { tz, otp, newPassword, confirmPassword } = req.body || {};

    const normTz = String(tz ?? "").trim();
    if (!normTz || !otp || !newPassword) return res.status(400).json({ ok: false, message: "Missing fields" });
    if (String(otp).length !== 6) return res.status(400).json({ ok: false, message: "OTP must be 6 digits" });
    if (newPassword !== confirmPassword) return res.status(400).json({ ok: false, message: "Passwords do not match" });

    const user = await User.findOne({ tz: normTz });
    if (!user) return res.status(400).json({ ok: false, message: "Invalid or expired code" });

    if (user.resetOtpLockedUntil && user.resetOtpLockedUntil > new Date()) {
      return res.status(429).json({ ok: false, message: "Too many attempts. Try later." });
    }

    if (!user.resetOtpHash || !user.resetOtpExpires || user.resetOtpExpires <= new Date()) {
      return res.status(400).json({ ok: false, message: "Invalid or expired code" });
    }

    const ok = sha256(String(otp)) === user.resetOtpHash;

    if (!ok) {
      user.resetOtpAttempts = (user.resetOtpAttempts || 0) + 1;
      if (user.resetOtpAttempts >= MAX_ATTEMPTS) {
        user.resetOtpLockedUntil = new Date(Date.now() + LOCK_MIN * 60 * 1000);
      }
      await user.save();
      return res.status(400).json({ ok: false, message: "Invalid or expired code" });
    }

    user.password = encryptPassword(newPassword); // pre-save will bcrypt
    user.resetOtpHash = undefined;
    user.resetOtpExpires = undefined;
    user.resetOtpAttempts = 0;
    user.resetOtpLockedUntil = undefined;
    await user.save();

    await safeNotify({
      toRoles: ["ادارة"],
      module: "USERS",
      action: "PASSWORD_RESET",
      title: "تم تغيير كلمة المرور",
      message: `تم تغيير كلمة مرور المستخدم (${user.tz})`,
      entity: { kind: "user", id: user._id },
      meta: { tz: user.tz },
      createdBy: user._id,
    });

    return res.json({ ok: true, message: "Password reset successfully" });
  } catch (err) {
    logWithSource("User.resetPassword", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

/**
 * מנהל בלבד: מציג סיסמה רק אם היא enc
 * ❌ bcrypt אי אפשר להציג בכלל
 *
 * GET /users/viewPassword/:tz
 */
const viewPassword = async (req, res) => {
  try {
    console.log("viewPassword params:", req.params);
    const tz = String(req.params.tz).trim();
    if (!tz) return res.status(400).json({ ok: false, message: 'tz is required' });

    // חובה: להביא גם password
    const user = await User.findOne({ tz }).select('+password');
    if (!user) return res.status(404).json({ ok: false, message: 'User not found' });

    const stored = user.password;
    console.log("Stored password format:", stored, isBcryptHash(stored));
    // bcrypt? אין decrypt
    if (isBcryptHash(stored)) {
      return res.status(200).json({
        ok: false,
        canView: false,
        algo: 'bcrypt',
        message: 'Cannot view password for old users (bcrypt is one-way). Use reset instead.',
      });
    }
    console.log(isEncrypted(stored));
    // enc? אפשר לפענח
    if (isEncrypted(stored)) {
      const plain = decryptPassword(stored);

      // מומלץ: לוג פנימי (אל תכתוב את הסיסמה ללוג!)
      // logWithSource(`ADMIN viewed password for tz=${tz}`);

      return res.status(200).json({
        ok: true,
        canView: true,
        algo: 'enc',
        password: plain, // ⚠️ מחזיר סיסמה בפועל
      });
    }

    return res.status(400).json({
      ok: false,
      canView: false,
      algo: 'unknown',
      message: 'Unknown password format',
    });
  } catch (err) {
    return res.status(500).json({ ok: false,
      canView: false,
      algo: 'unknown', message: err.message});

  }
};

module.exports = {
  viewPassword,
  uploadPhoto,
  CheckPasswordisGood,
  register,
  login,
  refreshAccessToken,
  logout,
  getme,
  getAllU,
  getOneU,
  postU,
  putU,
  deleteU,
  changeRoom,
  forgotPassword,
  resetPassword,
};
