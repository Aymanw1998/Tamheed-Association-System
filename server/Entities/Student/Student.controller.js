// Entities/User/user.controller.js
const PdfPrinter = require("pdfmake");
const fs = require("fs");
const path = require('path');
const axios = require('axios');

const  Student = require('./Student.model');
  const InviteToken = require('../InviteToken/InviteToken.model');
const { uploadPhotoC, deletePhotoC } = require('../UploadFile/photoStudent');
const { logWithSource } = require('../../middleware/logger');

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
const info = ["tz", "firstname", "lastname", "birth_date", "gender", "phone", "email", "city", "street", "father_name", "mother_name", "father_phone", "mother_phone"];

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
  father_name: body.father_name,
  mother_name: body.mother_name,
  father_phone: body.father_phone,
  mother_phone: body.mother_phone,
  father_work: body.father_work,
  mother_work: body.mother_work,
  school: body.school,
  layer: body.layer,
  health_status: body.health_status || "",
  notes: body.notes || "",
  main_teacher: body.main_teacher || null,
});


// --- CRUD (כפי שיש לך) ---
const getAllS = async (req, res) => {
  try {
    const students = await Student.find({});
    return res.status(200).json({ ok: true, students: students.map(sanitize) });
  } catch (err) {
    logWithSource(`err ${err}`.red);
    return res.status(500).json({ ok: false, students: []});
  }
};

const getOneS = async (req, res) => {
  try {
    logWithSource("getOneS", req.params);
    const { tz: param } = req.params;
    const student = await Student.findOne({tz: param});

    logWithSource("student", student);
    if (!student) student = await Student.findOne({ tz: String(param).trim() });
    if (!student) return res.status(404).json({ ok: false, message: 'לא נמצא' });
    return res.status(200).json({ ok: true, student: sanitize(student) });
  } catch (err) {
    logWithSource(`err ${err}`.red);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

const postS = async (req, res) => {
    try {
    const model = buildData(req.body);
    if (!model.tz) {
      return res.status(400).json({ ok: false, message: 'tz required' });
    }
    const exists = await Student.findOne({ tz: model.tz });
    if (exists) return res.status(409).json({ ok: false, message: 'המשתמש קיים' });

    const created = await Student.create({ ...model, createdAt: new Date() });
    return res.status(201).json({ ok: true, student: sanitize(created) });
  } catch (err) {
    logWithSource(`err ${err}`.red);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

//USER{} => {..}
const putS = async (req, res) => {
  try {
    const tz = String(req.params.tz).trim();
    const student = await Student.findOne({ tz });
    if (!student) return res.status(404).json({ ok: false, message: 'Student not found' });

    const allowed = Student.schema ? new Set(Object.keys(Student.schema.paths)) : new Set(info);
    console.log("allowed", allowed);

    const body = req.body ?? {};

    for (const [k, v] of Object.entries(body)) {
      // עדכן רק מפתחות מותרים
      if (!allowed.has(k)) continue;

      // אל תדרוס ערכים קיימים עם undefined
      if (typeof v === 'undefined' || typeof v === 'null' || v === "") continue;

      // הרשה null/"" אם זה רצונך לאפס שדות (מלבד password)
      student.set(k, v);
    }

    await student.save();
    return res.status(200).json({ ok: true, student: sanitize(student) });
  } catch (err) {
    logWithSource(`err ${err}`.red);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

const uploadPhoto = async (req, res) => {
  try {
    if (!req.params.tz) return res.status(400).json({ ok: false, message: 'tz is required' });
    console.log("upload photo student", req.file);
    const student = await Student.findOne({ tz: String(req.params.tz).trim() });
    if (!student) return res.status(404).json({ ok: false, message: 'Student not found' });
    if (!req.file) return res.status(400).json({ ok: false, message: 'file is required' });

    if(student.photo){
      const deleted = await deletePhotoC(student.photo);
      console.log("deleted previous photo student", deleted);
    }

    const uploaded = await uploadPhotoC(req.file, "students");
    console.log("uploaded photo student", uploaded);
    student.photo = uploaded.secure_url;
    await student.save();
    return res.status(200).json({ ok: true, photo: student.photo });
  } catch (err) {
    logWithSource(`err ${err}`.red);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

const deleteS = async (req, res) => {
  try {
    if (!req.params.tz) return res.status(400).json({ ok: false, message: 'tz is required' });
    console.log("delete user", req.params);

    const deleted = await Student.findOneAndDelete({ tz: String(req.params.tz).trim() });
    if (!deleted) return res.status(404).json({ ok: false, message: 'Student not found' });
        return res.status(200).json({ ok: true, removed: true });
  } catch (err) {
    logWithSource(`err ${err}`.red);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

const reverseArabic = (str) => {return str.split(' ').reverse().join(' ');}
const generateStudentPDF = async (req, res) => {
      try {
    const { tz } = req.params;
    const student = await Student.findOne({ tz });
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
      ['اسم الأب', student.father_name],
      ['هاتف الأب', student.father_phone],
      ['عمل الأب', student.father_work],
      ['اسم الأم', student.mother_name],
      ['هاتف الأم', student.mother_phone],
      ['عمل الأم', student.mother_work],
      ['المدرسة', student.school],
      ['الصف', student.layer],
      ['الحالة الصحية', student.health_status],
      ['ملاحظات', student.notes],
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
          text: reverseArabic("جمعية تمهيد - بيانات الطالب"),
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

module.exports = {
  generateStudentPDF,
  getAllS,
  getOneS,
  postS,
  putS,
  deleteS,
  uploadPhoto,
};
