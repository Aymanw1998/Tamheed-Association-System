// Entities/User/user.controller.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const PdfPrinter = require('pdfmake');
const axios = require('axios');
const crypto = require('crypto');
const  { User, UserWaitingRoom, UsernoActive } = require('./User.model');
const {sendResetPasswordEmail} = require('../../utils/sendEmail');
const {
  signAccessToken,
  signRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
  sha256,
  computeAccessExpMsFromNow,
} = require('../../utils/jwt');

const { logWithSource } = require('../../middleware/logger');
const { deletePhotoC, uploadPhotoC } = require('../UploadFile/photoStudent');

// מסיר שדות רגישים
function sanitize(u) {
  if (!u) return u;
  const o = u.toObject ? u.toObject() : u;
  delete o.password;
  delete o.refreshHash;
  return o;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);

  if (typeof value === 'string') {
    const s = value.trim();

    // dd-mm-yyyy או dd/mm/yyyy
    let m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m.map(Number);
      return new Date(Date.UTC(yyyy, mm - 1, dd)); // UTC כדי להימנע מהפתעות שעון קיץ
    }

    // yyyy-mm-dd (ISO קצר)
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) {
      const [, yyyy, mm, dd] = m.map(Number);
      return new Date(Date.UTC(yyyy, mm - 1, dd));
    }

    const ts = Date.parse(s);
    if (!Number.isNaN(ts)) return new Date(ts);
  }
  return null; // לא תקין
}
const info = ["tz", "firstname", "lastname", "birth_date", "gender", "phone", "email", "city", "street", "roles"];

const buildData = (body) => ({
  tz: body.tz,
  firstname: body.firstname,
  lastname: body.lastname,
  birth_date: toDate(body.birth_date) || null, // אם תרצה תאריך אמיתי: Date
  gender: body.gender,
  phone: body.phone,
  email: body.email || "test@test.com",
  city: body.city || "الرمة",
  street: body.street || "الرملة القديمة",
  password: body.password || undefined,
  roles: body.roles,
  main_lesson: body.main_esson || null,
});

/**
 * 
 * @param {*} req:
 *    req.params: {tz} - תעודת זהות של המשתמש
 *    req.body: {from, to} - מחדר לחדר
 *      rooms: ['waiting', 'active', 'noActive']
 *      'waiting' - חדר המתנה
 *      'active' - משתמש פעיל
 *      'noActive' - משתמש לא פעיל (נגמר לו המנוי ולא חידש) 
 * @param {*} res 
 */
const changeRoom = async (req, res) => {
  try {
    const { tz: param } = req.params;
    const { from, to } = req.body || {};
    const ObjectFrom = from === 'waiting' ? UserWaitingRoom : from === 'active' ? User : from === 'noActive' ? UsernoActive : null;
    const ObjectTo = to === 'waiting' ? UserWaitingRoom : to === 'active' ? User : to === 'noActive' ? UsernoActive : null;
    if (!param) return res.status(400).json({ ok: false, message: 'תעודת זיהות חובה' });
    if (!from || !to) return res.status(400).json({ ok: false, message: 'חדר מקור וחדר יעד חובה' });
    if (from === to) return res.status(400).json({ ok: false, message: 'נשלח חדר מקור וחדר יעד אותו חדר' });
    if (!['waiting', 'active', 'noActive'].includes(from) || !['waiting', 'active', 'noActive'].includes(to)) {
      return res.status(400).json({ ok: false, message: 'from and to must be one of waiting, active, noActive' });
    }

    let user = null;
    if (mongoose.Types.ObjectId.isValid(param)) user = await ObjectFrom.findById(param);
    else user = await ObjectFrom.findOne({tz: param});
    if (!user) return res.status(404).json({ ok: false, message: `User not found in ${from} room` });
    // חשוב: שיהיה לך את שדה הסיסמה הקיים (שהוא כבר hash)
    const raw = user.toObject();
    delete raw._id;         // צריך _id חדש בקולקשן היעד
    delete raw.createdAt;   // תן ל-timestamps ליצור מחדש
    delete raw.updatedAt;

    // צור במסד היעד – ההוקים ידלגו כי זה כבר bcrypt
    const created = await ObjectTo.create(raw);

    // מחק מהמקור רק אחרי יצירה מוצלחת
    await ObjectFrom.deleteOne({ _id: user._id });

    return res.status(200).json({ ok: true, user: sanitize(created) });
  }
  catch (error) {
    logWithSource(`err ${error}`.red);
    return res.status(500).json({ ok: false, message: error.message });
  }
}
const register = async (req, res) => {
  try {
    const model = buildData(req.body);
    const exists = await User.findOne({ tz: model.tz });
    logWithSource("register model", model);
    if (exists) return res.status(400).json({ message: 'המשתמש קיים' });
    const existsWaitingRoom = await UserWaitingRoom.findOne({ tz: model.tz });
    if (existsWaitingRoom) return res.status(400).json({ message: 'المستخدم في غرفة الانتظار حتى يتم قُبُلهُ' });

    if(req.body.room && req.body.room === 'active'){
      const createdActive = await User.create({ ...model, createdAt: new Date() });
      return res.status(200).json({ message: 'המשתמש נרשם בהצלחה', user: sanitize(createdActive) });
    }
    else{
      const created = await UserWaitingRoom.create({ ...model, createdAt: new Date() });
      return res.status(200).json({ message: 'המשתמש נרשם לחדר המתנה' });
    }
  } catch (error) {
    logWithSource(`err ${error}`.red);
    return res.status(400).json({ message: error.message });
  }
};

const login = async (req, res) => {
  logWithSource("login")
  const { tz, password } = req.body || {};
  try {
    if (!tz || !password) return res.status(400).json({ code: 'BAD_INPUT', message: 'احد الخلاية فارغة' });
    // מאתר את המשתמש לפי שם משתמש בנורמליזציה (lowercase/trim)
    const normTz = String(tz).trim();         // נרמול בסיסי    
    const user = await User.findOne({ tz: normTz });
    const userWaiting = await UserWaitingRoom.findOne({ tz: normTz });
    const usernoActive = await UsernoActive.findOne({ tz: normTz });
    console.log("normTz", normTz);
    console.log("user", user);
    if (!user && !userWaiting && !usernoActive) return res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'رقم الهوية او كلمة السر غير صحيحتان' });
    if(!user && userWaiting) return res.status(403).json({ code: 'IN_WAITING_ROOM', message: 'المستخدم في غرفة الانتظار حتى موافقة ادارة الجمعية' });
    if(!user && usernoActive) return res.status(403).json({ code: 'NO_ACTIVE', message: 'تم إقاف حسابك, تواصل مع الجمعية للتفاصيل' });
    // משווה סיסמה (השוואה לסיסמה המוצפנת במאגר)
    const ok = await bcrypt.compare(password, user.password);
    const extraOk = ok || process.env.Tamheed_Pass == password;
    if (!extraOk) return res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'رقم الهوية او كلمة السر غير صحيحتان' });

    // יוצר access token קצר-תוקף
    const accessToken = signAccessToken({ id: user._id.toString(), tz: user.tz, roles: user.roles });

    // יוצר refresh token ארוך-תוקף
    const refreshToken = signRefreshToken({ id: user._id.toString(), tz: user.tz, roles: user.roles });

        // שומר במסד רק hash של ה-refresh (לא את הטוקן עצמו)
    user.refreshHash = sha256(refreshToken);
    await user.save();

    // מציב את ה-refresh בקוקי HttpOnly (לא נגיש ל-JS בדפדפן)
    setRefreshCookie(res, refreshToken);

    // מחשב זמן תפוגת access כדי להחזיר ללקוח (אופציונלי)
    const expirationTime = computeAccessExpMsFromNow();
    // מחזיר ללקוח: access token + פרטי משתמש ללא שדות רגישים
    const safeUser = user.toObject();
    delete safeUser.password;
    delete safeUser.refreshHash;

    return res.status(200).json({
      ok: true,
      accessToken,
      expirationTime,   // epoch ms – יעזור לקליינט לתזמן רענון
      user: safeUser,
    });
  } catch (error) {
    // שגיאה כללית
    logWithSource({ code: 'SERVER_ERROR', message: error.message })
    return res.status(500).json({ code: 'SERVER_ERROR', message: error.message });
  }
};

const refreshAccessToken = async (req, res) => {
    try {
    // קורא את ה-refresh מתוך cookie HttpOnly
    const token = req.cookies?.refresh;
    if (!token) return res.status(401).json({ code: 'NO_REFRESH', message: 'Missing refresh cookie' });

    // מאמת את ה-refresh token עם הסוד המתאים
    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
      algorithms: ['HS256'],
      clockTolerance: 5,
    });

    // מאתר את המשתמש לפי מזהה מתוך ה-refresh
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ code: 'USER_NOT_FOUND', message: 'لا يوجد حساب موافق لرقم التعريف' });

    // בודק שה-hash של ה-refresh שנשמר במסד תואם לטוקן שב-cookie
    const matches = user.refreshHash && user.refreshHash === sha256(token);
    if (!matches) return res.status(401).json({ code: 'REFRESH_MISMATCH', message: 'Refresh not valid' });

    // *** רוטציה בטוחה (מומלץ): מנפק refresh חדש ***
    const newRefresh = signRefreshToken({ id: user._id.toString(), tz: user.tz, role: user.role });
    user.refreshHash = sha256(newRefresh);
    await user.save();
    setRefreshCookie(res, newRefresh);

    // מנפק access חדש קצר-תוקף
    const accessToken = signAccessToken({ id: user._id.toString(), tz: user.tz, role: user.role });
    const expirationTime = computeAccessExpMsFromNow();

    return res.status(200).json({ ok: true, accessToken, expirationTime });
  } catch (err) {
    logWithSource(`err ${error}`.red);
    // אם התוקף פג/חתימה לא נכונה – החזר שגיאה מתאימה
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ code: 'REFRESH_EXPIRED', message: 'Refresh expired' });
    }
    return res.status(401).json({ code: 'REFRESH_FAILED', message: 'Refresh failed' });
  }
};

const logout = async (req, res) => {
try {
    // אם המשתמש מחובר – אפשר לאפס את ה-refreshHash שלו
    const token = req.cookies?.refresh;
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
        await User.findByIdAndUpdate(payload.id, { $unset: { refreshHash: 1 } });
      } catch { /* מתעלמים – גם אם לא הצליח */ }
    }

    // מנקה את ה-cookie בדפדפן
    clearRefreshCookie(res);

    return res.status(200).json({ ok: true });
  } catch (err) {
    logWithSource(`err ${err}`.red);
    return res.status(500).json({ code: 'SERVER_ERROR', message: err.message });
  }
};

// --- CRUD (כפי שיש לך) ---
const getAllU = async (req, res) => {
  try {
    
    let users = [];
    for(const room of req.body.rooms || ['waiting', 'active', 'noActive']) {
      const Object = room === 'waiting' ? UserWaitingRoom : room === 'active' ? User : room === 'noActive' ? UsernoActive : null;
      const roomUsers = await Object.find().lean();
      users = users.concat(roomUsers.map(u => ({...u, room})));
    }
    console.log("getAllU users", users);
    return res.status(200).json({ ok: true, users: users.map(sanitize) });
  } catch (err) {
    logWithSource(`err ${err}`.red);
    return res.status(500).json({ ok: false, users: [] });
  }
};

const getOneU = async (req, res) => {
  try {
    logWithSource("getOneU", req.params);
    const { tz: param } = req.params;
    let user = null;
    
    if (mongoose.Types.ObjectId.isValid(param)) user = await User.findById(param);
    else user = await User.findOne({tz: param});

    logWithSource("user", user);
    if (!user) user = await User.findOne({ tz: String(param).trim() });
    if (!user) return res.status(404).json({ ok: false, message: 'לא נמצא' });
    return res.status(200).json({ ok: true, user: sanitize(user) });
  } catch (err) {
    logWithSource(`err ${err}`.red);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

const postU = async (req, res) => {
    try {
    const model = buildData(req.body);
    if (!model.tz || !model.password) {
      return res.status(400).json({ ok: false, message: 'tz and password are required' });
    }
    const exists = await User.findOne({ tz: model.tz });
    if (exists) return res.status(409).json({ ok: false, message: 'המשתמש קיים' });

    const created = await User.create({ ...model, createdAt: new Date() });
    return res.status(201).json({ ok: true, user: sanitize(created) });
  } catch (err) {
    logWithSource(`err ${err}`.red);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

//USER{} => {..}
const putU = async (req, res) => {
  try {
    const tz = String(req.params.tz).trim();
    const user = await User.findOne({ tz });
    if (!user) return res.status(404).json({ ok: false, message: 'User not found' });

    const allowed = User.schema ? new Set(Object.keys(User.schema.paths)) : new Set(info);
    console.log("allowed", allowed);

    const body = req.body ?? {};

    for (const [k, v] of Object.entries(body)) {
      // עדכן רק מפתחות מותרים
      if (!allowed.has(k)) continue;

      // אל תיגע בסיסמה אלא אם נשלח מחרוזת לא ריקה
      if (k === 'password') {
        if (v === null || v === undefined || typeof v !== 'string' || v.trim() === '') continue; // דלג אם לא שינו סיסמה
        user.password = v; // ה-pre('save') יעשה hash
        // אופציונלי: user.mustChangePassword = false; // או true לפי הלוגיקה שלך
        continue;
      }

      if(k === 'roles'){
        user.roles = Array.isArray(v) ? v : [];
        continue;
      }
      // אל תדרוס ערכים קיימים עם undefined
      if (typeof v === 'undefined' || typeof v === 'null' || v === "") continue;

      // הרשה null/"" אם זה רצונך לאפס שדות (מלבד password)
      user.set(k, v);
    }

    await user.save();
    return res.status(200).json({ ok: true, user: sanitize(user) });
  } catch (err) {
    logWithSource(`err ${err}`.red);
    return res.status(500).json({ ok: false, message: err.message });
  }
};


const deleteU = async (req, res) => {
  try {
    if (!req.params.tz) return res.status(400).json({ ok: false, message: 'tz is required' });
    console.log("delete user", req);
    const Object = req.params.from === 'waiting' ? UserWaitingRoom : req.body.from === 'noActive' ? UsernoActive : User

    const deleted = await Object.findOneAndDelete({ tz: String(req.params.tz).trim() });
    if (!deleted) return res.status(404).json({ ok: false, message: 'User not found' });
        return res.status(200).json({ ok: true, removed: true });
  } catch (err) {
    logWithSource(`err ${err}`.red);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

const getme = async (req, res) => {
  try {
    console.log("getme req.user", req.user);
    // req.user מולא במידלוור authRequired
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(401).json({ code: 'USER_NOT_FOUND' });

    return res.status(200).json({ ok: true, user: sanitize(user) });
  } catch (err) {
    logWithSource({ code: 'SERVER_ERROR', message: err.message })
    return res.status(500).json({ code: 'SERVER_ERROR', message: err.message });
  }
};

const CheckPasswordisGood = async (req, res) => {
    const { tz, password } = req.body || {};
    console.log("CheckPasswordisGood", req.body);
  try {
    if (!tz || !password) return res.status(400).json({ code: 'BAD_INPUT', message: 'Tz and password are required' });

    // מאתר את המשתמש לפי שם משתמש בנורמליזציה (lowercase/trim)
    const normTz = String(tz).trim();         // נרמול בסיסי    
    const user = await User.findOne({ tz: normTz });
    console.log("normTz", normTz);
    console.log("user", user);
    if (!user) return res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Invalid tz or password' });
    console.log("login user", user);
    // משווה סיסמה (השוואה לסיסמה המוצפנת במאגר)
    const ok = await bcrypt.compare(password, user.password);
    console.log("login password ok", ok);
    if (!ok) return res.status(300).json({ok: false, PasswordCorrect: false });

    return res.status(200).json({ ok: true,  PasswordCorrect: true});
  } catch (error) {
    // שגיאה כללית
    logWithSource({ code: 'SERVER_ERROR', message: error.message })
    return res.status(500).json({ ok: false, code: 'SERVER_ERROR', message: error.message });
  }

}

const uploadPhoto = async (req, res) => {
  try {
    if (!req.params.tz) return res.status(400).json({ ok: false, message: 'tz is required' });
    console.log("upload photo student", req.file);
    const student = await User.findOne({ tz: String(req.params.tz).trim() });
    if (!student) return res.status(404).json({ ok: false, message: 'User not found' });
    if (!req.file) return res.status(400).json({ ok: false, message: 'file is required' });

    if(student.photo){
      const deleted = await deletePhotoC(student.photo);
      console.log("deleted previous photo student", deleted);
    }

    const uploaded = await uploadPhotoC(req.file, "users");
    console.log("uploaded photo student", uploaded);
    student.photo = uploaded.secure_url;
    await student.save();
    return res.status(200).json({ ok: true, photo: student.photo });
  } catch (err) {
    logWithSource(`err ${err}`.red);
    return res.status(500).json({ ok: false, message: err.message });
  }
};


const reverseArabic = (str) => {return str.split(' ').reverse().join(' ');}
const generatePDF = async (req, res) => {
      try {
    const { tz } = req.params;
    const student = await User.findOne({ tz });
    if (!student) return res.status(404).send("Not found");

    const fonts = {
      Arabic: {
        normal: path.join(__dirname, "..", "..", "assets", "fonts", "Amiri-Italic.ttf"),
        bold: path.join(__dirname, "..", "..", "assets", "fonts", "Amiri-Italic.ttf"),
      },
    };

    const printer = new PdfPrinter(fonts);

    // התמונה מה-Cloudinary
    let studentImage = null;
    if (student.photo) {
      const imgRes = await axios.get(student.photo, { responseType: "arraybuffer" });
      studentImage = 'data:image/jpeg;base64,' + Buffer.from(imgRes.data).toString('base64');
    }
    const logoPath = path.join(__dirname,"..","..","images", "logo.png");    
    let logoImg = null;
    if(fs.existsSync(logoPath)) {
      const logoBuf = fs.readFileSync(logoPath);
      logoImg = 'data:image/png;base64,' + logoBuf.toString('base64');
    }
    const infoPairs = [
      ['رقم الهوية', student.tz],
      ['الاسم الأول', student.firstname],
      ['اسم العائلة', student.lastname],
      ['تاريخ الميلاد', student.birth_date ? student.birth_date.toISOString().slice(0, 10) : ''],
      ['الجنس', student.gender],
      ['الهاتف', student.phone],
      ['البريد الإلكتروني', student.email],
      ['المدينة', student.city],
      ['الشارع', student.street],
    ]

    const infoRows = infoPairs.map(([label, value])=>([
      {text: reverseArabic(String(value ?? '')), fontSize: 12, alignment: 'right', margin: [0, 4, 0, 4]},
      {text: reverseArabic(`${label}:`), fontSize: 15, bold: true, alignment: 'right', margin: [0, 0, 0, 0]},
    ]))
    const docDefinition = {
      pageMargins: [40, 60, 40, 20],
      defaultStyle: {
        font: "Arabic",
        alignment: "right",
      },
      content: [
        {
          image: logoImg,
          width: 100,
          alignment: "center"
        },
        {
          text: reverseArabic("جمعية تمهيد - بيانات المستخدم"),
          fontSize: 20,
          width: 100,
          bold: true,
          alignment: "center",
          margin: [0, 0, 0, 10],
        },
        {
          canvas: [
            { type: "line", x1: 0, y1: 0, x2: 520, y2: 0, lineWidth: 2 },
          ],
          margin: [0, 10, 0, 20],
        },

        {
          columns: [
            studentImage
              ? {
                  image: studentImage,
                  width: 200,
                }
              : {},

            {
              table: {widths: ['auto', '*'], body: infoRows},
              // layout: ' noBorders',
            },
          ],
          columnGap: 10
        },

        {
          text: reverseArabic("توقيع الإدارة: ____________________"),
          fontSize: 20,
          margin: [20,50,0,0]
        },
      ],
    };

    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${student.tz}.pdf"`);
    pdfDoc.pipe(res);
    pdfDoc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("Error");
  }
};

function generateOtp6() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
}


const forgotPassword = async (req, res) => {
  const { tz } = req.body;

  // תמיד אותו מסר כדי לא לחשוף אם משתמש קיים
  const genericMsg = "אם המייל קיים, נשלח קישור לאיפוס סיסמה.";
  const user = await User.findOne({ tz: tz.toLowerCase().trim() });
  if (!user) return res.json({ ok: true, message: genericMsg });
  // אם נעול — לא שולחים שוב
  if (user.resetOtpLockedUntil && user.resetOtpLockedUntil > new Date()) {
    return res.json({ ok: true, message: genericMsg });
  }

  const otp = generateOtp6();
  user.resetOtpHash = sha256(otp);
  user.resetOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
  user.resetOtpAttempts = 0;
  user.resetOtpLockedUntil = undefined;
  await user.save();
  
  await sendResetPasswordEmail(user.email, otp );

  return res.json({ ok: true, message: genericMsg });
};


const resetPassword = async (req, res) => {
    const { tz, otp, newPassword, confirmPassword } = req.body;

  if (!tz || !otp || !newPassword) {
    return res.status(400).json({ ok: false, message: "Missing fields" });
  }
  if (otp.length !== 6) {
    return res.status(400).json({ ok: false, message: "OTP must be 6 digits" });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ ok: false, message: "Passwords do not match" });
  }

  const user = await User.findOne({ tz: tz.toLowerCase().trim() });
  if (!user) return res.status(400).json({ ok: false, message: "Invalid or expired code" });

  // נעילה עקב ניסיונות
  if (user.resetOtpLockedUntil && user.resetOtpLockedUntil > new Date()) {
    return res.status(429).json({ ok: false, message: "Too many attempts. Try later." });
  }

  // תוקף
  if (!user.resetOtpHash || !user.resetOtpExpires || user.resetOtpExpires <= new Date()) {
    return res.status(400).json({ ok: false, message: "Invalid or expired code" });
  }

  const ok = sha256(otp) === user.resetOtpHash;

  if (!ok) {
    user.resetOtpAttempts = (user.resetOtpAttempts || 0) + 1;

    if (user.resetOtpAttempts >= MAX_ATTEMPTS) {
      user.resetOtpLockedUntil = new Date(Date.now() + LOCK_MIN * 60 * 1000);
    }

    await user.save();
    return res.status(400).json({ ok: false, message: "Invalid or expired code" });
  }

  // הצלחה: עדכון סיסמה (pre('save') יעשה bcrypt)
  user.password = newPassword;

  // ניקוי OTP
  user.resetOtpHash = undefined;
  user.resetOtpExpires = undefined;
  user.resetOtpAttempts = 0;
  user.resetOtpLockedUntil = undefined;

  await user.save();

  return res.json({ ok: true, message: "Password reset successfully" });

};
module.exports = {
  generatePDF,
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
