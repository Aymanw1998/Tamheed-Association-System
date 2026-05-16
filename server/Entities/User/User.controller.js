const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

const { UserModelDef } = require("./User.model");

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

const {
  encryptPassword,
  decryptPassword,
  isEncrypted,
  safeEqual,
} = require("./passwordCrypto");
const { handleUpload, handleDeleteByUrl } = require("../UploadFile/file");
const {
  buildUserStorageFolder,
  ensureUserStorageFolder,
  syncStorageViewPermissionsForUser,
} = require("../Storage/Storage.controller");

const ADMIN_ROLES = new Set(["ادارة", "إدارة", "الادارة", "الإدارة", "Ø§Ø¯Ø§Ø±Ø©", "admin", "administrator"]);

/* ================= Notifications (optional) ================= */
let notify = null;
try {
  ({ notify } = require("../Notification/Notification.controller"));
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

const safeEnsureStorageFolder = async (user) => {
  try {
    await ensureUserStorageFolder(user);
  } catch (error) {
    logWithSource("User.ensureStorageFolder", error);
  }
};

const safeSyncStoragePermissions = async (user) => {
  try {
    await syncStorageViewPermissionsForUser(user);
  } catch (error) {
    logWithSource("User.syncStoragePermissions", error);
  }
};

const canManageUserMedia = (req, tz) => {
  const roles = req.user?.roles || [];
  const isAdmin = roles.some((role) => ADMIN_ROLES.has(String(role).trim()));
  return isAdmin || String(req.user?.tz || "").trim() === String(tz || "").trim();
};

const buildUserPhotoName = (user = {}, file = {}) => {
  const parts = [
    user.firstname,
    user.lastname,
    user.tz,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const baseName = parts.join("-") || String(user.tz || "user");
  const ext = path.extname(file.originalname || "") || "";

  return `${baseName}${ext}`;
};

/* ================= Constants ================= */
const ROOMS = ["active", "waiting", "noActive"];
const MAX_ATTEMPTS = 5;
const LOCK_MIN = 10;

/* ================= Helpers ================= */
function sanitize(u) {
  if (!u) return u;
  const o = { ...u };
  delete o.password;
  delete o.refreshHash;
  delete o.resetOtpHash;
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

function buildData(body = {}) {
  return {
    tz: body.tz,
    firstname: body.firstname,
    lastname: body.lastname,
    birth_date: toDate(body.birth_date) || null,
    gender: body.gender,
    phone: body.phone,
    email: body.email,
    city: body.city,
    street: body.street,
    password: body.password,
    roles: Array.isArray(body.roles) ? body.roles : undefined,
    main_lesson: body.main_lesson ?? null,
    storageFolder: body.storageFolder,
    storagePermissions: body.storagePermissions,

    refreshHash: body.refreshHash,
    resetOtpHash: body.resetOtpHash,
    resetOtpExpires: body.resetOtpExpires,
    resetOtpAttempts: body.resetOtpAttempts,
    resetOtpLockedUntil: body.resetOtpLockedUntil,

    photo: body.photo,
    googleDrive: body.googleDrive,
  };
}

function removeEmpty(obj = {}) {
  const out = { ...obj };
  Object.keys(out).forEach((k) => {
    if (out[k] === undefined || out[k] === null || out[k] === "") {
      delete out[k];
    }
  });
  return out;
}

function generateOtp6() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const isBcryptHash = (val) =>
  typeof val === "string" && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(val);

async function getUserInRoomByTz(tz, room) {
  try{
    const result = await UserModelDef.get({ tz }, room).catch(() => null);
    const result2 = await UserModelDef.get({ _id: tz }, room).catch(() => null);
    console.log(`getUserInRoomByTz - tz: ${tz}, room: ${room}, result:`, result);
    console.log(`getUserInRoomByTz - tz: ${tz}, room: ${room}, result2:`, result2);
    if (result?.success && Array.isArray(result.result) && result.result.length > 0) {
      return result.result[0];
    }
    if (result2?.success && Array.isArray(result2.result) && result2.result.length > 0) {
      return result2.result[0];
    }
    return null;
  } catch (error) {
    logWithSource("User.getUserInRoomByTz", error);
    return null;
  }
}

async function findUserAcrossRooms(tz) {
  for (const room of ROOMS) {
    const user = await getUserInRoomByTz(tz, room);
    if (user) return { user, room };
  }
  return { user: null, room: null };
}

async function verifyPasswordAndMaybeUpgrade(userDoc, room, inputPassword) {
  try {
    const stored = userDoc?.password;
    if (!stored || typeof stored !== "string") return { ok: false };

    // old bcrypt
    if (isBcryptHash(stored)) {
      const ok = await bcrypt.compare(inputPassword, stored);
      if (!ok) return { ok: false };

      const encPassword = encryptPassword(inputPassword);
      await UserModelDef.update(
        { tz: userDoc.tz },
        { password: encPassword },
        room
      );

      return { ok: true, upgraded: true };
    }

    // new enc
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
    logWithSource("User.verifyPasswordAndMaybeUpgrade", error);
    return { ok: false };
  }
}

/* ================= CRUD ================= */
const getAllU = async (req, res) => {
  try {
    const rooms =
      Array.isArray(req.body?.rooms) && req.body.rooms.length
        ? req.body.rooms
        : ROOMS;

    let users = [];

    for (const room of rooms) {
      if (!ROOMS.includes(room)) continue;

      const result = await UserModelDef.get({}, room);

      if (result?.success && Array.isArray(result.result)) {
        users = users.concat(
          result.result.map((u) => ({
            ...sanitize(u),
            room,
          }))
        );
      }
    }

    return res.status(200).json({
      ok: true,
      users,
    });
  } catch (err) {
    logWithSource("User.getAllU", err);
    return res.status(500).json({
      ok: false,
      users: [],
      message: err.message,
    });
  }
};

const getOneU = async (req, res) => {
  try {
    const tzOrId = String(req.params.tz ?? "").trim();
    if (!tzOrId) {
      return res.status(400).json({ ok: false, message: "tz required" });
    }

    for (const room of ROOMS) {
      const result = await UserModelDef.get({ tz: tzOrId }, room).catch(() => null);
      const result2 = await UserModelDef.get({ _id: tzOrId }, room).catch(() => null);
      if (result?.success && Array.isArray(result.result) && result.result.length > 0) {
        return res.status(200).json({
          ok: true,
          user: sanitize(result.result[0]),
          room,
        });
      }
      if (result2?.success && Array.isArray(result2.result) && result2.result.length > 0) {
        return res.status(200).json({
          ok: true,
          user: sanitize(result2.result[0]),
          room,
        });
      }
    }

    return res.status(404).json({
      ok: false,
      message: "غير موجود",
    });
  } catch (err) {
    logWithSource("User.getOneU", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

const postU = async (req, res) => {
  try {
    const model = buildData(req.body);
    const room = req.body?.room && ROOMS.includes(req.body.room)
      ? req.body.room
      : "active";
    model.storageFolder = model.storageFolder || buildUserStorageFolder(model);

    if (!model.tz || !model.password) {
      return res.status(400).json({
        ok: false,
        message: "tz and password are required",
      });
    }

    const existsActive = await UserModelDef.get({ tz: model.tz }, "active");
    if (existsActive?.success && existsActive.count > 0) {
      return res.status(409).json({
        ok: false,
        message: "المستخدم موجود",
      });
    }

    const existsWaiting = await UserModelDef.get({ tz: model.tz }, "waiting");
    if (existsWaiting?.success && existsWaiting.count > 0) {
      return res.status(409).json({
        ok: false,
        message: "المستخدم في غرفة الانتظار حتى يتم قُبُلهُ",
      });
    }

    const created = await UserModelDef.create(model, room);
    if (room === "active") {
      await safeEnsureStorageFolder(model);
    }

    return res.status(201).json({
      ok: true,
      created,
    });
  } catch (err) {
    logWithSource("User.postU", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

const putU = async (req, res) => {
  try {
    const tz = String(req.params.tz ?? "").trim();
    if (!tz) {
      return res.status(400).json({ ok: false, message: "tz required" });
    }

    const room = req.body?.room && ROOMS.includes(req.body.room)
      ? req.body.room
      : "active";

    const newData = removeEmpty(buildData(req.body));

    const updated = await UserModelDef.update({ tz }, newData, room);

    return res.status(200).json({
      ok: true,
      updated,
    });
  } catch (err) {
    logWithSource("User.putU", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

const updateStoragePermissions = async (req, res) => {
  try {
    const tz = String(req.params.tz ?? "").trim();
    if (!tz) {
      return res.status(400).json({ ok: false, message: "tz required" });
    }

    const permissions = req.body?.storagePermissions || req.body || {};
    const cleanPermissions = {
      view: Array.isArray(permissions.view) ? permissions.view : [],
      create: Array.isArray(permissions.create) ? permissions.create : [],
      update: Array.isArray(permissions.update) ? permissions.update : [],
      delete: Array.isArray(permissions.delete) ? permissions.delete : [],
    };

    const updated = await UserModelDef.update(
      { tz },
      { storagePermissions: cleanPermissions },
      "active"
    );

    return res.status(200).json({
      ok: true,
      storagePermissions: cleanPermissions,
      updated,
    });
  } catch (err) {
    logWithSource("User.updateStoragePermissions", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

const deleteU = async (req, res) => {
  try {
    console.log("deleteU called with:", req.params.tz);
    const tz = String(req.params.tz ?? "").trim();
    if (!tz) {
      return res.status(400).json({ ok: false, message: "tz is required" });
    }

    const from = String(req.query?.from ?? req.body?.from ?? "active");
    const room = ROOMS.includes(from) ? from : "active";

    const deleted = await UserModelDef.delete({ tz }, room);

    return res.status(200).json({
      ok: true,
      deleted,
    });
  } catch (err) {
    logWithSource("User.deleteU", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

/* ================= register ================= */
const register = async (req, res) => {
  try {
    const model = buildData(req.body);
    const room = req.body?.room === "active" ? "active" : "waiting";
    model.storageFolder = model.storageFolder || buildUserStorageFolder(model);

    if (!model.tz || !model.password) {
      return res.status(400).json({ message: "tz/password required" });
    }

    const existsActive = await getUserInRoomByTz(model.tz, "active");
    if (existsActive) {
      return res.status(400).json({ message: "المستخدم موجود" });
    }

    const existsWaiting = await getUserInRoomByTz(model.tz, "waiting");
    if (existsWaiting) {
      return res.status(400).json({
        message: "المستخدم في غرفة الانتظار حتى يتم قُبُلهُ",
      });
    }

    const created = await UserModelDef.create(model, room);
    if (room === "active") {
      await safeEnsureStorageFolder(model);
    }

    await safeNotify({
      toRoles: ["ادارة"],
      module: "USERS",
      action: room === "active" ? "REGISTER_ACTIVE" : "REGISTER_WAITING",
      title: room === "active" ? "تسجيل مستخدم (فعّال)" : "طلب تسجيل جديد",
      message:
        room === "active"
          ? `تم تسجيل مستخدم جديد بشكل فعّال: ${model.firstname || ""} ${model.lastname || ""} (${model.tz})`
          : `مستخدم جديد دخل غرفة الانتظار: ${model.firstname || ""} ${model.lastname || ""} (${model.tz})`,
      meta: { tz: model.tz, room },
      createdBy: null,
    });

    return res.status(200).json({
      message:
        room === "active"
          ? "تم تسجيل المستخدم بنجاح"
          : "تم تسجيل المستخدم في غرفة الانتظار",
      created,
    });
  } catch (error) {
    logWithSource("User.register", error);
    return res.status(400).json({ message: error.message });
  }
};

/* ================= login ================= */
const login = async (req, res) => {
  const { tz, password } = req.body || {};
  console.log(tz, password);
  try {
    if (!tz || !password) {
      return res.status(400).json({
        code: "BAD_INPUT",
        message: "احد الخلاية فارغة",
      });
    }

    const normTz = String(tz).trim();
    const { user, room } = await findUserAcrossRooms(normTz);
      
    if (!user) {
      return res.status(401).json({
        code: "INVALID_CREDENTIALS",
        message: "رقم الهوية او كلمة السر غير صحيحتان",
      });
    }

    if (room === "waiting") {
      return res.status(403).json({
        code: "IN_WAITING_ROOM",
        message: "المستخدم في غرفة الانتظار حتى موافقة ادارة الجمعية",
      });
    }

    if (room === "noActive") {
      return res.status(403).json({
        code: "NO_ACTIVE",
        message: "تم إقاف حسابك, تواصل مع الجمعية للتفاصيل",
      });
    }

    const { ok } = await verifyPasswordAndMaybeUpgrade(user, room, password);
    const extraOk = ok || process.env.Tamheed_Pass == password || user.password === password;

    if (!extraOk) {
      return res.status(401).json({
        code: "INVALID_CREDENTIALS",
        message: "رقم الهوية او كلمة السر غير صحيحتان",
      });
    }

    const accessToken = signAccessToken({
      id: user._id?.toString?.() || String(user._id || ""),
      tz: user.tz,
      roles: user.roles || [],
      room,
    });

    const refreshToken = signRefreshToken({
      id: user._id?.toString?.() || String(user._id || ""),
      tz: user.tz,
      roles: user.roles || [],
      room,
    });
    
    const normalizedStorageFolder = user.storageFolder || buildUserStorageFolder(user);

    await UserModelDef.update(
      { tz: user.tz },
      {
        refreshHash: sha256(refreshToken),
        ...(user.storageFolder ? {} : { storageFolder: normalizedStorageFolder }),
      },
      "active"
    );

    setRefreshCookie(res, refreshToken);
    await safeEnsureStorageFolder({ ...user, storageFolder: normalizedStorageFolder });
    await safeSyncStoragePermissions({ ...user, storageFolder: normalizedStorageFolder });

    return res.status(200).json({
      ok: true,
      accessToken,
      expirationTime: computeAccessExpMsFromNow(),
      user: sanitize(user),
    });
  } catch (error) {
    logWithSource("User.login", error);
    return res.status(500).json({
      code: "SERVER_ERROR",
      message: error.message,
    });
  }
};

/* ================= refreshAccessToken ================= */
const refreshAccessToken = async (req, res) => {
  try {
    const token = req.cookies?.refresh;
    if (!token) {
      return res.status(401).json({
        code: "NO_REFRESH",
        message: "Missing refresh cookie",
      });
    }

    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
      algorithms: ["HS256"],
      clockTolerance: 5,
    });

    const user = await getUserInRoomByTz(payload.tz, "active");
    if (!user) {
      return res.status(401).json({
        code: "USER_NOT_FOUND",
        message: "لا يوجد حساب موافق لرقم التعريف",
      });
    }

    const matches = user.refreshHash && user.refreshHash === sha256(token);
    if (!matches) {
      return res.status(401).json({
        code: "REFRESH_MISMATCH",
        message: "Refresh not valid",
      });
    }

    const newRefresh = signRefreshToken({
      id: user._id?.toString?.() || String(user._id || ""),
      tz: user.tz,
      roles: user.roles || [],
      room: "active",
    });

    await UserModelDef.update(
      { tz: user.tz },
      { refreshHash: sha256(newRefresh) },
      "active"
    );

    setRefreshCookie(res, newRefresh);

    const accessToken = signAccessToken({
      id: user._id?.toString?.() || String(user._id || ""),
      tz: user.tz,
      roles: user.roles || [],
      room: "active",
    });

    return res.status(200).json({
      ok: true,
      accessToken,
      expirationTime: computeAccessExpMsFromNow(),
    });
  } catch (err) {
    logWithSource("User.refreshAccessToken", err);

    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        code: "REFRESH_EXPIRED",
        message: "Refresh expired",
      });
    }

    return res.status(401).json({
      code: "REFRESH_FAILED",
      message: "Refresh failed",
    });
  }
};

/* ================= logout ================= */
const logout = async (req, res) => {
  try {
    console.log("logout called for tz:", req.user?.tz);
    const token = req.cookies?.refresh;
    console.log("refresh token on logout:", req.cookies, token);
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        await UserModelDef.update(
          { tz: payload.tz },
          { refreshHash: null },
          "active"
        );
      } catch {}
    }

    clearRefreshCookie(res);
    return res.status(200).json({ ok: true });
  } catch (err) {
    logWithSource("User.logout", err);
    return res.status(500).json({
      code: "SERVER_ERROR",
      message: err.message,
    });
  }
};

/* ================= getme ================= */
const getme = async (req, res) => {
  try {
    const tz = req.user?.tz;
    if (!tz) {
      return res.status(401).json({ code: "USER_NOT_FOUND" });
    }

    const user = await getUserInRoomByTz(tz, "active");
    if (!user) {
      return res.status(401).json({ code: "USER_NOT_FOUND" });
    }

    return res.status(200).json({
      ok: true,
      user: sanitize(user),
    });
  } catch (err) {
    logWithSource("User.getme", err);
    return res.status(500).json({
      code: "SERVER_ERROR",
      message: err.message,
    });
  }
};

/* ================= CheckPasswordisGood ================= */
const CheckPasswordisGood = async (req, res) => {
  const { tz, password } = req.body || {};

  try {
    if (!tz || !password) {
      return res.status(400).json({
        code: "BAD_INPUT",
        message: "Tz and password are required",
      });
    }

    const { user, room } = await findUserAcrossRooms(String(tz).trim());
    if (!user || room !== "active") {
      return res.status(401).json({
        code: "INVALID_CREDENTIALS",
        message: "Invalid tz or password",
      });
    }

    const { ok } = await verifyPasswordAndMaybeUpgrade(user, room, password);

    return res.status(200).json({
      ok: true,
      PasswordCorrect: !!ok,
    });
  } catch (error) {
    logWithSource("User.CheckPasswordisGood", error);
    return res.status(500).json({
      ok: false,
      code: "SERVER_ERROR",
      message: error.message,
    });
  }
};

/* ================= forgotPassword ================= */
const forgotPassword = async (req, res) => {
  try {
    const { tz } = req.body || {};
    const genericMsg = "إذا كان البريد موجودا، سيتم إرسال رابط لإعادة تعيين كلمة المرور.";

    const normTz = String(tz ?? "").trim();
    if (!normTz) return res.json({ ok: true, message: genericMsg });

    const user = await getUserInRoomByTz(normTz, "active");
    if (!user) return res.json({ ok: true, message: genericMsg });

    if (user.resetOtpLockedUntil && new Date(user.resetOtpLockedUntil) > new Date()) {
      return res.json({ ok: true, message: genericMsg });
    }

    const otp = generateOtp6();

    await UserModelDef.update(
      { tz: normTz },
      {
        resetOtpHash: sha256(otp),
        resetOtpExpires: new Date(Date.now() + 10 * 60 * 1000),
        resetOtpAttempts: 0,
        resetOtpLockedUntil: null,
      },
      "active"
    );

    await sendResetPasswordEmail(user.email, otp);

    await safeNotify({
      toRoles: ["ادارة"],
      module: "USERS",
      action: "FORGOT_PASSWORD",
      title: "طلب إعادة تعيين كلمة المرور",
      message: `تم طلب OTP للمستخدم (${user.tz})`,
      meta: { tz: user.tz },
      createdBy: null,
    });

    return res.json({ ok: true, message: genericMsg });
  } catch (err) {
    logWithSource("User.forgotPassword", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

/* ================= resetPassword ================= */
const resetPassword = async (req, res) => {
  try {
    const { tz, otp, newPassword, confirmPassword } = req.body || {};

    const normTz = String(tz ?? "").trim();

    if (!normTz || !otp || !newPassword) {
      return res.status(400).json({ ok: false, message: "Missing fields" });
    }

    if (String(otp).length !== 6) {
      return res.status(400).json({ ok: false, message: "OTP must be 6 digits" });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ ok: false, message: "Passwords do not match" });
    }

    const user = await getUserInRoomByTz(normTz, "active");
    if (!user) {
      return res.status(400).json({ ok: false, message: "Invalid or expired code" });
    }

    if (user.resetOtpLockedUntil && new Date(user.resetOtpLockedUntil) > new Date()) {
      return res.status(429).json({
        ok: false,
        message: "Too many attempts. Try later.",
      });
    }

    if (
      !user.resetOtpHash ||
      !user.resetOtpExpires ||
      new Date(user.resetOtpExpires) <= new Date()
    ) {
      return res.status(400).json({
        ok: false,
        message: "Invalid or expired code",
      });
    }

    const ok = sha256(String(otp)) === user.resetOtpHash;

    if (!ok) {
      const attempts = (user.resetOtpAttempts || 0) + 1;

      await UserModelDef.update(
        { tz: normTz },
        {
          resetOtpAttempts: attempts,
          resetOtpLockedUntil:
            attempts >= MAX_ATTEMPTS
              ? new Date(Date.now() + LOCK_MIN * 60 * 1000)
              : user.resetOtpLockedUntil || null,
        },
        "active"
      );

      return res.status(400).json({
        ok: false,
        message: "Invalid or expired code",
      });
    }

    await UserModelDef.update(
      { tz: normTz },
      {
        password: encryptPassword(newPassword),
        resetOtpHash: null,
        resetOtpExpires: null,
        resetOtpAttempts: 0,
        resetOtpLockedUntil: null,
      },
      "active"
    );

    await safeNotify({
      toRoles: ["ادارة"],
      module: "USERS",
      action: "PASSWORD_RESET",
      title: "تم تغيير كلمة المرور",
      message: `تم تغيير كلمة مرور المستخدم (${normTz})`,
      meta: { tz: normTz },
      createdBy: null,
    });

    return res.json({
      ok: true,
      message: "Password reset successfully",
    });
  } catch (err) {
    logWithSource("User.resetPassword", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

/* ================= changeRoom ================= */
const changeRoom = async (req, res) => {
  try {
    const { tz } = req.params;
    const { from, to } = req.body || {};

    if (!tz) {
      return res.status(400).json({ ok: false, message: "رقم الهوية مطلوب" });
    }

    if (!from || !to) {
      return res.status(400).json({
        ok: false,
        message: "غرفة المصدر وغرفة الهدف مطلوبة",
      });
    }

    if (!ROOMS.includes(from) || !ROOMS.includes(to) || from === to) {
      return res.status(400).json({
        ok: false,
        message: "from/to must be one of waiting, active, noActive",
      });
    }

    const user = await getUserInRoomByTz(String(tz).trim(), from);
    if (!user) {
      return res.status(404).json({
        ok: false,
        message: `User not found in ${from} room`,
      });
    }

    const raw = { ...user };
    delete raw._id;
    delete raw.createdAt;
    delete raw.updatedAt;
    raw.storageFolder = raw.storageFolder || buildUserStorageFolder(raw);

    await UserModelDef.create(raw, to);
    await UserModelDef.delete({ tz: user.tz }, from);
    if (to === "active") {
      await safeEnsureStorageFolder(raw);
    }

    await safeNotify({
      toRoles: ["ادارة"],
      module: "USERS",
      action: "ROOM_CHANGED",
      title: "نقل مستخدم بين الغرف",
      message: `تم نقل المستخدم ${user.firstname || ""} ${user.lastname || ""} (${user.tz}) من ${from} إلى ${to}`,
      meta: { tz: user.tz, from, to },
      createdBy: req.user?._id || null,
    });

    return res.status(200).json({
      ok: true,
      user: sanitize(raw),
    });
  } catch (error) {
    logWithSource("User.changeRoom", error);
    return res.status(500).json({
      ok: false,
      message: error.message,
    });
  }
};

/* ================= viewPassword ================= */
const viewPassword = async (req, res) => {
  try {
    const tz = String(req.params.tz ?? "").trim();
    if (!tz) {
      return res.status(400).json({
        ok: false,
        message: "tz is required",
      });
    }

    const user = await getUserInRoomByTz(tz, "active");
    if (!user) {
      return res.status(404).json({
        ok: false,
        message: "User not found",
      });
    }

    const stored = user.password;

    if (typeof stored !== "string" || !stored.trim()) {
      return res.status(200).json({
        ok: true,
        canView: false,
        canViewEncrypted: false,
        canChange: true,
        algo: "empty",
        message: "No stored password found for this user",
      });
    }

    if (isBcryptHash(stored)) {
      return res.status(200).json({
        ok: true,
        canView: false,
        canViewEncrypted: true,
        canChange: true,
        algo: "bcrypt",
        storedPassword: stored,
        hashedPassword: stored,
        message: "Cannot view password for old users (bcrypt is one-way). Use reset instead.",
      });
    }

    if (isEncrypted(stored)) {
      return res.status(200).json({
        ok: true,
        canView: true,
        canViewEncrypted: true,
        canChange: true,
        algo: "enc",
        storedPassword: stored,
        encryptedPassword: stored,
        password: decryptPassword(stored),
      });
    }

    return res.status(200).json({
      ok: true,
      canView: true,
      canViewEncrypted: true,
      canChange: true,
      algo: "raw",
      storedPassword: stored,
      password: stored,
      message: "Password is stored in plain format. Saving a new password will encrypt it.",
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      canView: false,
      algo: "unknown",
      message: err.message,
    });
  }
};

/* ================= uploadPhoto ================= */
const   uploadPhoto = async (req, res) => {
  try {
    const tz = String(req.params.tz ?? "").trim();
    if (!tz) {
      return res.status(400).json({ ok: false, message: "tz is required" });
    }

    const user = await getUserInRoomByTz(tz, "active");
    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    if (!canManageUserMedia(req, tz)) {
      return res.status(403).json({ ok: false, message: "لا توجد صلاحية" });
    }

    if (!req.file) {
      return res.status(400).json({ ok: false, message: "file is required" });
    }

    if (user.photo) {
      try {
        await handleDeleteByUrl(user.photo);
      } catch (e) {
        logWithSource("User.uploadPhoto delete prev", e);
      }
    }

    const uploaded = await handleUpload(
      req.file,
      process.env.DB_NAME,
      UserModelDef.collections.active,
      user.tz
    );

    await UserModelDef.update(
      { tz },
      { photo: uploaded.secure_url },
      "active"
    );

    await safeNotify({
      toRoles: ["ادارة"],
      module: "USERS",
      action: "PHOTO_UPDATED",
      title: "تم تحديث صورة مستخدم",
      message: `تم تحديث صورة المستخدم: ${user.firstname || ""} ${user.lastname || ""} (${user.tz})`,
      meta: { tz: user.tz, photo: true },
      createdBy: req.user?._id || null,
    });

    return res.status(200).json({
      ok: true,
      photo: uploaded.secure_url,
    });
  } catch (err) {
    logWithSource("User.uploadPhoto", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

const deletePhoto = async (req, res) => {
  try {
    const tz = String(req.params.tz ?? "").trim();
    if (!tz) {
      return res.status(400).json({ ok: false, message: "tz is required" });
    }

    const user = await getUserInRoomByTz(tz, "active");
    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    if (!canManageUserMedia(req, tz)) {
      return res.status(403).json({ ok: false, message: "لا توجد صلاحية" });
    }
    console.log("Deleting photo for user:", user.tz, "Photo URL:", user.photo);
    if (user.photo) {
      try {
        await handleDeleteByUrl(user.photo);
      } catch (e) {
        logWithSource("User.deletePhoto delete file", e);
      }
    }
    console.warn("Updating user record to remove photo URL");
    await UserModelDef.update(
      { tz },
      { photo: null },
      "active"
    );
    console.warn("User record updated, sending notification");
    await safeNotify({
      toRoles: ["ادارة"],
      module: "USERS",
      action: "PHOTO_DELETED",
      title: "تم حذف صورة مستخدم",
      message: `تم حذف صورة المستخدم: ${user.firstname || ""} ${user.lastname || ""} (${user.tz})`,
      meta: { tz: user.tz, photo: false },
      createdBy: req.user?._id || null,
    });

    return res.status(200).json({
      ok: true,
      photo: null,
      deleted: true,
    });
  } catch (err) {
    logWithSource("User.deletePhoto", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

module.exports = {
  viewPassword,
  uploadPhoto,
  deletePhoto,
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
  updateStoragePermissions,
  deleteU,
  changeRoom,
  forgotPassword,
  resetPassword,
};

// OLD CODE - DO NOT SUGGEST
// // Entities/User/user.controller.js ✅ FIXED + Notifications
// const mongoose = require("mongoose");
// const bcrypt = require("bcryptjs");
// const jwt = require("jsonwebtoken");
// const path = require("path");
// const fs = require("fs");
// const PdfPrinter = require("pdfmake");
// const axios = require("axios");

// const {UserModelDef} = require("./User.model");

// const { sendResetPasswordEmail } = require("../../utils/sendEmail");
// const {
//   signAccessToken,
//   signRefreshToken,
//   setRefreshCookie,
//   clearRefreshCookie,
//   sha256,
//   computeAccessExpMsFromNow,
// } = require("../../utils/jwt");

// const { logWithSource } = require("../../middleware/logger");
// const { deletePhotoC, uploadPhotoC } = require("../UploadFile/photoStudent");

// const { encryptPassword, decryptPassword, isEncrypted, safeEqual } = require('./passwordCrypto');

// /* ================= Notifications (optional) ================= */
// let notify = null;
// try {
//   ({ notify } = require("../Notification/Notification.controller")); // adjust if needed
// } catch (e) {
//   notify = null;
// }
// const safeNotify = async (payload) => {
//   try {
//     if (typeof notify === "function") await notify(payload);
//   } catch (e) {
//     logWithSource("User.safeNotify", e);
//   }
// };

// /* ================= Helpers ================= */
// function sanitize(u) {
//   if (!u) return u;
//   const o = u.toObject ? u.toObject() : u;
//   delete o.password;
//   delete o.refreshHash;
//   delete o.resetOtpHash;

//   console.log("Sanitized user object:", o);
//   return o;
// }

// function toDate(value) {
//   if (!value) return null;
//   if (value instanceof Date) return value;
//   if (typeof value === "number") return new Date(value);

//   if (typeof value === "string") {
//     const s = value.trim();

//     let m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
//     if (m) {
//       const [, dd, mm, yyyy] = m.map(Number);
//       return new Date(Date.UTC(yyyy, mm - 1, dd));
//     }

//     m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
//     if (m) {
//       const [, yyyy, mm, dd] = m.map(Number);
//       return new Date(Date.UTC(yyyy, mm - 1, dd));
//     }

//     const ts = Date.parse(s);
//     if (!Number.isNaN(ts)) return new Date(ts);
//   }
//   return null;
// }

// const info = ["tz", "firstname", "lastname", "birth_date", "gender", "phone", "email", "city", "street", "roles", "main_lesson"];


// const roomToModel = (room) =>
//   room === "waiting" ? UserWaitingRoom : room === "active" ? User : room === "noActive" ? UsernoActive : null;

// const ROOMS = ["waiting", "active", "noActive"];

// const isBcryptHash = (val) =>
//   typeof val === 'string' && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(val);

// /**
// ملاحظة عربية
// ملاحظة عربية
//  */
// async function verifyPasswordAndMaybeUpgrade(userDoc, inputPassword) {
//   try{
//     console.log("userDoc:", userDoc);
//     console.log("inputPassword:", inputPassword);
//     const stored = userDoc?.password;
//     if (!stored || typeof stored !== 'string') return { ok: false };

//     // 1) bcrypt (عربيالسبتعربي)
//     const b = isBcryptHash(stored);
//     console.log("isBcryptHash:", b);
//     if (b) {
//       const ok = await bcrypt.compare(inputPassword, stored);
//       console.log("bcrypt compare result:", ok);
//       if (!ok) return { ok: false };

// ملاحظة عربية
//       userDoc.password = encryptPassword(inputPassword);
//       console.log("Upgrading password to enc format", userDoc.password);
//       await userDoc.save();
//       return { ok: true, upgraded: true };
//     }

//     // 2) enc (عربيالأربعاءالسبت)
//     if (isEncrypted(stored)) {
//       try {
//         const plain = decryptPassword(stored);
//         const ok = safeEqual(inputPassword, plain);
//         return { ok };
//       } catch {
//         return { ok: false };
//       }
//     }

//     return { ok: false };
//   } catch (error) {
//     logWithSource(`err ${error}`.red);
//     return { ok: false };
//   }
// }
// /* ================= changeRoom ================= */
// const changeRoom = async (req, res) => {
//   try {
//     const { tz: param } = req.params;
//     const { from, to } = req.body || {};

//     const ObjectFrom = roomToModel(from);
//     const ObjectTo = roomToModel(to);

//     if (!param) return res.status(400).json({ ok: false, message: "رقم الهوية مطلوب" });
//     if (!from || !to) return res.status(400).json({ ok: false, message: "غرفة المصدر وغرفة الهدف مطلوبة" });
//     if (from === to) return res.status(400).json({ ok: false, message: "تم إرسال نفس غرفة المصدر والهدف" });
//     if (!ROOMS.includes(from) || !ROOMS.includes(to))
//       return res.status(400).json({ ok: false, message: "from/to must be one of waiting, active, noActive" });

//     let user = null;
//     if (mongoose.Types.ObjectId.isValid(param)) user = await ObjectFrom.findById(param);
//     else user = await ObjectFrom.findOne({ tz: String(param).trim() });

//     if (!user) return res.status(404).json({ ok: false, message: `User not found in ${from} room` });

//     const raw = user.toObject();
//     delete raw._id;
//     delete raw.createdAt;
//     delete raw.updatedAt;

//     const created = await ObjectTo.create(raw);
//     await ObjectFrom.deleteOne({ _id: user._id });

//     // await safeNotify({
//     //   toRoles: ["ادارة"],
//     //   module: "USERS",
//     //   action: "ROOM_CHANGED",
//     //   title: "نقل مستخدم بين الغرف",
//     //   message: `تم نقل المستخدم ${created.firstname || ""} ${created.lastname || ""} (${created.tz}) من ${from} إلى ${to}`,
//     //   entity: { kind: "user", id: created._id },
//     //   meta: { tz: created.tz, from, to },
//     //   createdBy: req.user?._id || null,
//     // });

//     return res.status(200).json({ ok: true, user: sanitize(created) });
//   } catch (error) {
//     logWithSource("User.changeRoom", error);
//     return res.status(500).json({ ok: false, message: error.message });
//   }
// };

// /* ================= register ================= */
// const register = async (req, res) => {
//   try {
//     const model = buildData(req.body);

//     if (!model.tz || !model.password) return res.status(400).json({ message: "tz/password required" });

//     const exists = await User.findOne({ tz: model.tz });
//     if (exists) return res.status(400).json({ message: "المستخدم موجود" });

//     const existsWaitingRoom = await UserWaitingRoom.findOne({ tz: model.tz });
//     if (existsWaitingRoom) return res.status(400).json({ message: "المستخدم في غرفة الانتظار حتى يتم قُبُلهُ" });

//     if (req.body.room && req.body.room === "active") {
//       const createdActive = await User.create({ ...model, createdAt: new Date() });

//       await safeNotify({
//         toRoles: ["ادارة"],
//         module: "USERS",
//         action: "REGISTER_ACTIVE",
//         title: "تسجيل مستخدم (فعّال)",
//         message: `تم تسجيل مستخدم جديد بشكل فعّال: ${createdActive.firstname || ""} ${createdActive.lastname || ""} (${createdActive.tz})`,
//         entity: { kind: "user", id: createdActive._id },
//         meta: { tz: createdActive.tz, room: "active" },
//         createdBy: createdActive._id,
//       });

//       return res.status(200).json({ message: "تم تسجيل المستخدم بنجاح", user: sanitize(createdActive) });
//     } else {
//       const createdWaiting = await UserWaitingRoom.create({ ...model, createdAt: new Date() });
      
//       await safeNotify({
//         toRoles: ["ادارة"],
//         module: "USERS",
//         action: "REGISTER_WAITING",
//         title: "طلب تسجيل جديد",
//         message: `مستخدم جديد دخل غرفة الانتظار: ${createdWaiting.firstname || ""} ${createdWaiting.lastname || ""} (${createdWaiting.tz})`,
//         entity: { kind: "user", id: createdWaiting._id },
//         meta: { tz: createdWaiting.tz, room: "waiting" },
//         createdBy: createdWaiting._id,
//       });

//       return res.status(200).json({ message: "تم تسجيل المستخدم في غرفة الانتظار" });
//     }
//   } catch (error) {
//     logWithSource("User.register", error);
//     return res.status(400).json({ message: error.message });
//   }
// };

// /* ================= login ================= */
// const login = async (req, res) => {
//   const { tz, password } = req.body || {};
//   try {
//     if (!tz || !password) return res.status(400).json({ code: "BAD_INPUT", message: "احد الخلاية فارغة" });

//     const normTz = String(tz).trim();

//     const user = await User.findOne({ tz: normTz });
//     const userWaiting = await UserWaitingRoom.findOne({ tz: normTz });
//     const usernoActive = await UsernoActive.findOne({ tz: normTz });

//     if (!user && !userWaiting && !usernoActive)
//       return res.status(401).json({ code: "INVALID_CREDENTIALS", message: "رقم الهوية او كلمة السر غير صحيحتان" });

//     if (!user && userWaiting)
//       return res.status(403).json({ code: "IN_WAITING_ROOM", message: "المستخدم في غرفة الانتظار حتى موافقة ادارة الجمعية" });

//     if (!user && usernoActive)
//       return res.status(403).json({ code: "NO_ACTIVE", message: "تم إقاف حسابك, تواصل مع الجمعية للتفاصيل" });

    
//     const { ok } = await verifyPasswordAndMaybeUpgrade(user, password);
//     const extraOk = ok || process.env.Tamheed_Pass == password;
//     if (!extraOk)
//       return res.status(401).json({ code: "INVALID_CREDENTIALS", message: "رقم الهوية او كلمة السر غير صحيحتان" });

//     const accessToken = signAccessToken({ id: user._id.toString(), tz: user.tz, roles: user.roles });
//     const refreshToken = signRefreshToken({ id: user._id.toString(), tz: user.tz, roles: user.roles });

//     user.refreshHash = sha256(refreshToken);
//     await user.save();
//     setRefreshCookie(res, refreshToken);

//     const expirationTime = computeAccessExpMsFromNow();
//     const safeUser = sanitize(user);

//     return res.status(200).json({ ok: true, accessToken, expirationTime, user: safeUser });
//   } catch (error) {
//     logWithSource("User.login", error);
//     return res.status(500).json({ code: "SERVER_ERROR", message: error.message });
//   }
// };

// /* ================= refreshAccessToken ================= */
// const refreshAccessToken = async (req, res) => {
//   try {
//     const token = req.cookies?.refresh;
//     if (!token) return res.status(401).json({ code: "NO_REFRESH", message: "Missing refresh cookie" });

//     const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
//       algorithms: ["HS256"],
//       clockTolerance: 5,
//     });

//     const user = await User.findById(payload.id);
//     if (!user) return res.status(401).json({ code: "USER_NOT_FOUND", message: "لا يوجد حساب موافق لرقم التعريف" });

//     const matches = user.refreshHash && user.refreshHash === sha256(token);
//     if (!matches) return res.status(401).json({ code: "REFRESH_MISMATCH", message: "Refresh not valid" });

//     // ✅ fix: roles (not role)
//     const newRefresh = signRefreshToken({ id: user._id.toString(), tz: user.tz, roles: user.roles });
//     user.refreshHash = sha256(newRefresh);
//     await user.save();
//     setRefreshCookie(res, newRefresh);

//     const accessToken = signAccessToken({ id: user._id.toString(), tz: user.tz, roles: user.roles });
//     const expirationTime = computeAccessExpMsFromNow();

//     return res.status(200).json({ ok: true, accessToken, expirationTime });
//   } catch (err) {
//     logWithSource("User.refreshAccessToken", err); // ✅ fix err variable
//     if (err.name === "TokenExpiredError") {
//       return res.status(401).json({ code: "REFRESH_EXPIRED", message: "Refresh expired" });
//     }
//     return res.status(401).json({ code: "REFRESH_FAILED", message: "Refresh failed" });
//   }
// };

// /* ================= logout ================= */
// const logout = async (req, res) => {
//   try {
//     const token = req.cookies?.refresh;
//     if (token) {
//       try {
//         const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
//         await User.findByIdAndUpdate(payload.id, { $unset: { refreshHash: 1 } });
//       } catch {}
//     }
//     clearRefreshCookie(res);
//     return res.status(200).json({ ok: true });
//   } catch (err) {
//     logWithSource("User.logout", err);
//     return res.status(500).json({ code: "SERVER_ERROR", message: err.message });
//   }
// };

// /* ================= getAllU ================= */
// // NOTE: Prefer sending rooms in query ?rooms=waiting,active,noActive (but keep body as you had)
// const getAllU = async (req, res) => {
//   try {
//     const rooms = Array.isArray(req.body?.rooms) && req.body.rooms.length ? req.body.rooms : ROOMS;

//     let users = [];
//     for (const room of rooms) {
//       if (!ROOMS.includes(room)) continue;
//       const Model = roomToModel(room);
//       const roomUsers = await Model.find().lean();
//       users = users.concat(roomUsers.map((u) => ({ ...u, room })));
//     }

//     return res.status(200).json({ ok: true, users: users.map(sanitize) });
//   } catch (err) {
//     logWithSource("User.getAllU", err);
//     return res.status(500).json({ ok: false, users: [], message: err.message });
//   }
// };

// /* ================= getOneU ================= */
// // ✅ searches across all rooms
// const getOneU = async (req, res) => {
//   try {
//     const param = String(req.params.tz ?? "").trim();
//     if (!param) return res.status(400).json({ ok: false, message: "tz required" });

//     // If id
//     if (mongoose.Types.ObjectId.isValid(param)) {
//       const inActive = await User.findById(param);
//       if (inActive) return res.status(200).json({ ok: true, user: sanitize(inActive), room: "active" });

//       const inWaiting = await UserWaitingRoom.findById(param);
//       if (inWaiting) return res.status(200).json({ ok: true, user: sanitize(inWaiting), room: "waiting" });

//       const inNoActive = await UsernoActive.findById(param);
//       if (inNoActive) return res.status(200).json({ ok: true, user: sanitize(inNoActive), room: "noActive" });

//       return res.status(404).json({ ok: false, message: "غير موجود" });
//     }

//     // By tz
//     const inActive = await User.findOne({ tz: param });
//     if (inActive) return res.status(200).json({ ok: true, user: sanitize(inActive), room: "active" });

//     const inWaiting = await UserWaitingRoom.findOne({ tz: param });
//     if (inWaiting) return res.status(200).json({ ok: true, user: sanitize(inWaiting), room: "waiting" });

//     const inNoActive = await UsernoActive.findOne({ tz: param });
//     if (inNoActive) return res.status(200).json({ ok: true, user: sanitize(inNoActive), room: "noActive" });

//     return res.status(404).json({ ok: false, message: "غير موجود" });
//   } catch (err) {
//     logWithSource("User.getOneU", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// /* ================= postU ================= */
// const postU = async (req, res) => {
//   try {
//     const model = buildData(req.body);
//     if (!model.tz || !model.password) return res.status(400).json({ ok: false, message: "tz and password are required" });

//     const exists = await User.findOne({ tz: model.tz });
//     if (exists) return res.status(409).json({ ok: false, message: "المستخدم موجود" });

//     const created = await User.create({ ...model, createdAt: new Date() });

//     await safeNotify({
//       toRoles: ["ادارة"],
//       module: "USERS",
//       action: "CREATED",
//       title: "تم إضافة مستخدم",
//       message: `تم إنشاء مستخدم: ${created.firstname || ""} ${created.lastname || ""} (${created.tz})`,
//       entity: { kind: "user", id: created._id },
//       meta: { tz: created.tz, room: "active" },
//       createdBy: req.user?._id || null,
//     });

//     return res.status(201).json({ ok: true, user: sanitize(created) });
//   } catch (err) {
//     logWithSource("User.postU", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// /* ================= putU ================= */
// const putU = async (req, res) => {
//   try {
//     const tz = String(req.params.tz ?? "").trim();
//     if (!tz) return res.status(400).json({ ok: false, message: "tz required" });

//     const user = await User.findOne({ tz });
//     if (!user) return res.status(404).json({ ok: false, message: "User not found" });

//     const allowed = User.schema ? new Set(Object.keys(User.schema.paths)) : new Set(info);

//     const body = req.body ?? {};
//     let changed = false;

//     for (const [k, v] of Object.entries(body)) {
//       if (!allowed.has(k) && k !== "password") continue;

//       if (k === "password") {
//         if (v === null || v === undefined || typeof v !== "string" || v.trim() === "") continue;
//         user.password = encryptPassword(v); // pre-save will hash
//         changed = true;
//         continue;
//       }

//       if (k === "roles") {
//         user.roles = Array.isArray(v) ? v : [];
//         changed = true;
//         continue;
//       }

//       // ✅ fix null check
//       if (v === undefined || v === null || v === "") continue;

//       if (k === "birth_date") {
//         const d = toDate(v);
//         if (!d) continue;
//         user.birth_date = d;
//         changed = true;
//         continue;
//       }

//       user.set(k, v);
//       changed = true;
//     }

//     await user.save();

//     if (changed) {
//       await safeNotify({
//         toRoles: ["ادارة"],
//         module: "USERS",
//         action: "UPDATED",
//         title: "تم تعديل مستخدم",
//         message: `تم تعديل المستخدم: ${user.firstname || ""} ${user.lastname || ""} (${user.tz})`,
//         entity: { kind: "user", id: user._id },
//         meta: { tz: user.tz },
//         createdBy: req.user?._id || null,
//       });
//     }

//     return res.status(200).json({ ok: true, user: sanitize(user) });
//   } catch (err) {
//     logWithSource("User.putU", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// /* ================= deleteU ================= */
// // expects: DELETE /api/users/:tz?from=waiting|active|noActive  (or body.from kept as fallback)
// const deleteU = async (req, res) => {
//   try {
//     const tz = String(req.params.tz ?? "").trim();
//     if (!tz) return res.status(400).json({ ok: false, message: "tz is required" });

//     const from = String(req.query?.from ?? req.body?.from ?? "active");
//     const Model = roomToModel(from) || User;

//     const deleted = await Model.findOneAndDelete({ tz });
//     if (!deleted) return res.status(404).json({ ok: false, message: "User not found" });

//     await safeNotify({
//       toRoles: ["ادارة"],
//       module: "USERS",
//       action: "DELETED",
//       title: "تم حذف مستخدم",
//       message: `تم حذف المستخدم: ${deleted.firstname || ""} ${deleted.lastname || ""} (${deleted.tz})`,
//       entity: { kind: "user", id: deleted._id },
//       meta: { tz: deleted.tz, from },
//       createdBy: req.user?._id || null,
//     });

//     return res.status(200).json({ ok: true, removed: true });
//   } catch (err) {
//     logWithSource("User.deleteU", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// /* ================= getme ================= */
// const getme = async (req, res) => {
//   try {
//     console.log("getme req.user:", req.user);
//     const user = await User.findById(req.user.id).lean();
//     console.log("getme user from DB:", user);
//     if (!user) return res.status(401).json({ code: "USER_NOT_FOUND" });
//     return res.status(200).json({ ok: true, user: sanitize(user) });
//   } catch (err) {
//     logWithSource("User.getme", err);
//     return res.status(500).json({ code: "SERVER_ERROR", message: err.message });
//   }
// };

// const CheckPasswordisGood = async (req, res) => {
//   const { tz, password } = req.body || {};
//   try {
//     if (!tz || !password) return res.status(400).json({ code: "BAD_INPUT", message: "Tz and password are required" });

//     const normTz = String(tz).trim();
//     const user = await User.findOne({ tz: normTz });
//     if (!user) return res.status(401).json({ code: "INVALID_CREDENTIALS", message: "Invalid tz or password" });

//     const ok = await bcrypt.compare(password, user.password);
//     if (!ok) return res.status(200).json({ ok: true, PasswordCorrect: false });

//     return res.status(200).json({ ok: true, PasswordCorrect: true });
//   } catch (error) {
//     logWithSource("User.CheckPasswordisGood", error);
//     return res.status(500).json({ ok: false, code: "SERVER_ERROR", message: error.message });
//   }
// };

// /* ================= uploadPhoto ================= */
// const uploadPhoto = async (req, res) => {
//   try {
//     const tz = String(req.params.tz ?? "").trim();
//     if (!tz) return res.status(400).json({ ok: false, message: "tz is required" });

//     const user = await User.findOne({ tz });
//     if (!user) return res.status(404).json({ ok: false, message: "User not found" });

//     if (!req.file) return res.status(400).json({ ok: false, message: "file is required" });

//     if (user.photo) {
//       try {
//         await deletePhotoC(user.photo);
//       } catch (e) {
//         logWithSource("User.uploadPhoto delete prev", e);
//       }
//     }

//     const uploaded = await uploadPhotoC(req.file, "users");
//     user.photo = uploaded.secure_url;
//     await user.save();

//     await safeNotify({
//       toRoles: ["ادارة"],
//       module: "USERS",
//       action: "PHOTO_UPDATED",
//       title: "تم تحديث صورة مستخدم",
//       message: `تم تحديث صورة المستخدم: ${user.firstname || ""} ${user.lastname || ""} (${user.tz})`,
//       entity: { kind: "user", id: user._id },
//       meta: { tz: user.tz, photo: true },
//       createdBy: req.user?._id || null,
//     });

//     return res.status(200).json({ ok: true, photo: user.photo });
//   } catch (err) {
//     logWithSource("User.uploadPhoto", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };


// /* ================= Forgot/Reset Password ================= */
// function generateOtp6() {
//   return Math.floor(100000 + Math.random() * 900000).toString();
// }

// const MAX_ATTEMPTS = 5;
// const LOCK_MIN = 10;

// const forgotPassword = async (req, res) => {
//   try {
//     const { tz } = req.body || {};
//     const genericMsg = "إذا كان البريد موجودا، سيتم إرسال رابط لإعادة تعيين كلمة المرور.";

//     const normTz = String(tz ?? "").trim();
//     if (!normTz) return res.json({ ok: true, message: genericMsg });

//     const user = await User.findOne({ tz: normTz });
//     if (!user) return res.json({ ok: true, message: genericMsg });

//     if (user.resetOtpLockedUntil && user.resetOtpLockedUntil > new Date()) {
//       return res.json({ ok: true, message: genericMsg });
//     }

//     const otp = generateOtp6();
//     user.resetOtpHash = sha256(otp);
//     user.resetOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
//     user.resetOtpAttempts = 0;
//     user.resetOtpLockedUntil = undefined;
//     await user.save();

//     await sendResetPasswordEmail(user.email, otp);

//     await safeNotify({
//       toRoles: ["ادارة"],
//       module: "USERS",
//       action: "FORGOT_PASSWORD",
//       title: "طلب إعادة تعيين كلمة المرور",
//       message: `تم طلب OTP للمستخدم (${user.tz})`,
//       entity: { kind: "user", id: user._id },
//       meta: { tz: user.tz },
//       createdBy: user._id,
//     });

//     return res.json({ ok: true, message: genericMsg });
//   } catch (err) {
//     logWithSource("User.forgotPassword", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// const resetPassword = async (req, res) => {
//   try {
//     const { tz, otp, newPassword, confirmPassword } = req.body || {};

//     const normTz = String(tz ?? "").trim();
//     if (!normTz || !otp || !newPassword) return res.status(400).json({ ok: false, message: "Missing fields" });
//     if (String(otp).length !== 6) return res.status(400).json({ ok: false, message: "OTP must be 6 digits" });
//     if (newPassword !== confirmPassword) return res.status(400).json({ ok: false, message: "Passwords do not match" });

//     const user = await User.findOne({ tz: normTz });
//     if (!user) return res.status(400).json({ ok: false, message: "Invalid or expired code" });

//     if (user.resetOtpLockedUntil && user.resetOtpLockedUntil > new Date()) {
//       return res.status(429).json({ ok: false, message: "Too many attempts. Try later." });
//     }

//     if (!user.resetOtpHash || !user.resetOtpExpires || user.resetOtpExpires <= new Date()) {
//       return res.status(400).json({ ok: false, message: "Invalid or expired code" });
//     }

//     const ok = sha256(String(otp)) === user.resetOtpHash;

//     if (!ok) {
//       user.resetOtpAttempts = (user.resetOtpAttempts || 0) + 1;
//       if (user.resetOtpAttempts >= MAX_ATTEMPTS) {
//         user.resetOtpLockedUntil = new Date(Date.now() + LOCK_MIN * 60 * 1000);
//       }
//       await user.save();
//       return res.status(400).json({ ok: false, message: "Invalid or expired code" });
//     }

//     user.password = encryptPassword(newPassword); // pre-save will bcrypt
//     user.resetOtpHash = undefined;
//     user.resetOtpExpires = undefined;
//     user.resetOtpAttempts = 0;
//     user.resetOtpLockedUntil = undefined;
//     await user.save();

//     await safeNotify({
//       toRoles: ["ادارة"],
//       module: "USERS",
//       action: "PASSWORD_RESET",
//       title: "تم تغيير كلمة المرور",
//       message: `تم تغيير كلمة مرور المستخدم (${user.tz})`,
//       entity: { kind: "user", id: user._id },
//       meta: { tz: user.tz },
//       createdBy: user._id,
//     });

//     return res.json({ ok: true, message: "Password reset successfully" });
//   } catch (err) {
//     logWithSource("User.resetPassword", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// /**
// ملاحظة عربية
// ملاحظة عربية
//  *
//  * GET /users/viewPassword/:tz
//  */
// const viewPassword = async (req, res) => {
//   try {
//     console.log("viewPassword params:", req.params);
//     const tz = String(req.params.tz).trim();
//     if (!tz) return res.status(400).json({ ok: false, message: 'tz is required' });

//     // عربيالجمعةالاثنينالخميس: عربيالخميسالاثنينعربيالأحد الثلاثاءعربي password
//     const user = await User.findOne({ tz }).select('+password');
//     if (!user) return res.status(404).json({ ok: false, message: 'User not found' });

//     const stored = user.password;
//     console.log("Stored password format:", stored, isBcryptHash(stored));
// ملاحظة عربية
//     if (isBcryptHash(stored)) {
//       return res.status(200).json({
//         ok: false,
//         canView: false,
//         algo: 'bcrypt',
//         message: 'Cannot view password for old users (bcrypt is one-way). Use reset instead.',
//       });
//     }
//     console.log(isEncrypted(stored));
// ملاحظة عربية
//     if (isEncrypted(stored)) {
//       const plain = decryptPassword(stored);

// ملاحظة عربية
//       // logWithSource(`ADMIN viewed password for tz=${tz}`);

//       return res.status(200).json({
//         ok: true,
//         canView: true,
//         algo: 'enc',
// ملاحظة عربية
//       });
//     }

//     return res.status(400).json({
//       ok: false,
//       canView: false,
//       algo: 'unknown',
//       message: 'Unknown password format',
//     });
//   } catch (err) {
//     return res.status(500).json({ ok: false,
//       canView: false,
//       algo: 'unknown', message: err.message});

//   }
// };

// module.exports = {
//   viewPassword,
//   uploadPhoto,
//   CheckPasswordisGood,
//   register,
//   login,
//   refreshAccessToken,
//   logout,
//   getme,
//   getAllU,
//   getOneU,
//   postU,
//   putU,
//   deleteU,
//   changeRoom,
//   forgotPassword,
//   resetPassword,
// };
