// Entities/User/user.controller.js
const PdfPrinter = require("pdfmake");
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const Student = require("./Student.model");
const InviteToken = require("../InviteToken/InviteToken.model"); // إذا بتحتاجه لاحقاً
const { uploadPhotoC, deletePhotoC } = require("../UploadFile/photoStudent");
const { logWithSource } = require("../../middleware/logger");

/* =============== Notifications (optional) =============== */
let notify = null;
try {
  ({ notify } = require("../Notification/Notification.controller")); // عدّل المسار إذا لازم
} catch (e) {
  notify = null;
}
const safeNotify = async (payload) => {
  try {
    if (typeof notify === "function") await notify(payload);
  } catch (e) {
    logWithSource("Student.safeNotify", e);
  }
};

/* =============== helpers =============== */
// remove sensitive fields
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
  if (typeof value === "number") return new Date(value);

  if (typeof value === "string") {
    const s = value.trim();

    // dd-mm-yyyy or dd/mm/yyyy
    let m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m.map(Number);
      return new Date(Date.UTC(yyyy, mm - 1, dd));
    }

    // yyyy-mm-dd
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

const infoKeys = [
  "tz","firstname","lastname","birth_date","gender","phone","email","city","street",
  "father_name","mother_name","father_phone","mother_phone","father_work","mother_work",
  "school","layer","health_status","notes","main_teacher","photo"
];

const buildData = (body = {}) => ({
  tz: body.tz,
  firstname: body.firstname,
  lastname: body.lastname,
  birth_date: toDate(body.birth_date) || null,
  gender: body.gender,
  phone: body.phone,
  email: body.email || "test@test.com",
  city: body.city || "الرملة",
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

/* =============== CRUD =============== */

// GET /api/students
const getAllS = async (req, res) => {
  try {
    const students = await Student.find({}).lean();
    return res.status(200).json({ ok: true, students: students.map(sanitize) });
  } catch (err) {
    logWithSource("Student.getAllS", err);
    return res.status(500).json({ ok: false, students: [], message: err.message });
  }
};

// GET /api/students/:tz
const getOneS = async (req, res) => {
  try {
    logWithSource("Student.getOneS params", req.params);
    const tzParam = String(req.params.tz ?? "").trim();
    if (!tzParam) return res.status(400).json({ ok: false, message: "tz required" });

    // ✅ FIX: let (مش const)
    let student = await Student.findOne({ tz: tzParam }).lean();
    if (!student) return res.status(404).json({ ok: false, message: "לא נמצא" });

    return res.status(200).json({ ok: true, student: sanitize(student) });
  } catch (err) {
    logWithSource("Student.getOneS", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// POST /api/students
const postS = async (req, res) => {
  try {
    const model = buildData(req.body);

    if (!model.tz) return res.status(400).json({ ok: false, message: "tz required" });
    if (!model.firstname || !model.lastname) {
      return res.status(400).json({ ok: false, message: "firstname/lastname required" });
    }

    const exists = await Student.findOne({ tz: String(model.tz).trim() }).lean();
    if (exists) return res.status(409).json({ ok: false, message: "המשתמש קיים" });

    const created = await Student.create({ ...model, createdAt: new Date() });

    // ✅ notify admins
    await safeNotify({
      toRoles: ["ادارة"],
      module: "STUDENTS",
      action: "CREATED",
      title: "تم إضافة طالب جديد",
      message: `تم إنشاء طالب: ${created.firstname || ""} ${created.lastname || ""} (${created.tz})`,
      entity: { kind: "student", id: created._id },
      meta: { tz: created.tz },
      createdBy: req.user?._id || null,
    });

    return res.status(201).json({ ok: true, student: sanitize(created) });
  } catch (err) {
    logWithSource("Student.postS", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// PUT /api/students/:tz
const putS = async (req, res) => {
  try {
    const tz = String(req.params.tz ?? "").trim();
    if (!tz) return res.status(400).json({ ok: false, message: "tz required" });

    const studentDoc = await Student.findOne({ tz });
    if (!studentDoc) return res.status(404).json({ ok: false, message: "Student not found" });

    const allowed =
      Student.schema ? new Set(Object.keys(Student.schema.paths)) : new Set(infoKeys);

    const body = req.body ?? {};

    let changed = false;

    for (const [k, v] of Object.entries(body)) {
      if (!allowed.has(k)) continue;

      // ✅ FIX null/undefined/"" handling
      if (v === undefined || v === null || v === "") continue;

      // ✅ parse birth_date if sent
      if (k === "birth_date") {
        const d = toDate(v);
        if (!d) continue;
        studentDoc.set(k, d);
        changed = true;
        continue;
      }

      studentDoc.set(k, v);
      changed = true;
    }

    if (!changed) {
      return res.status(200).json({ ok: true, student: sanitize(studentDoc), message: "no changes" });
    }

    await studentDoc.save();

    // ✅ notify admins
    await safeNotify({
      toRoles: ["ادارة"],
      module: "STUDENTS",
      action: "UPDATED",
      title: "تم تعديل طالب",
      message: `تم تعديل بيانات الطالب: ${studentDoc.firstname || ""} ${studentDoc.lastname || ""} (${studentDoc.tz})`,
      entity: { kind: "student", id: studentDoc._id },
      meta: { tz: studentDoc.tz },
      createdBy: req.user?._id || null,
    });

    return res.status(200).json({ ok: true, student: sanitize(studentDoc) });
  } catch (err) {
    logWithSource("Student.putS", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// POST /api/students/:tz/photo
const uploadPhoto = async (req, res) => {
  try {
    const tz = String(req.params.tz ?? "").trim();
    if (!tz) return res.status(400).json({ ok: false, message: "tz is required" });

    const student = await Student.findOne({ tz });
    if (!student) return res.status(404).json({ ok: false, message: "Student not found" });

    if (!req.file) return res.status(400).json({ ok: false, message: "file is required" });

    // delete previous
    if (student.photo) {
      try {
        await deletePhotoC(student.photo);
      } catch (e) {
        logWithSource("Student.uploadPhoto delete prev", e);
      }
    }

    const uploaded = await uploadPhotoC(req.file, "students");
    student.photo = uploaded.secure_url;
    await student.save();

    // ✅ notify admins
    await safeNotify({
      toRoles: ["ادارة"],
      module: "STUDENTS",
      action: "PHOTO_UPDATED",
      title: "تم تحديث صورة طالب",
      message: `تم تحديث صورة الطالب: ${student.firstname || ""} ${student.lastname || ""} (${student.tz})`,
      entity: { kind: "student", id: student._id },
      meta: { tz: student.tz, photo: true },
      createdBy: req.user?._id || null,
    });

    return res.status(200).json({ ok: true, photo: student.photo });
  } catch (err) {
    logWithSource("Student.uploadPhoto", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// DELETE /api/students/:tz
const deleteS = async (req, res) => {
  try {
    const tz = String(req.params.tz ?? "").trim();
    if (!tz) return res.status(400).json({ ok: false, message: "tz is required" });

    const deleted = await Student.findOneAndDelete({ tz });
    if (!deleted) return res.status(404).json({ ok: false, message: "Student not found" });

    // ✅ notify admins
    await safeNotify({
      toRoles: ["ادارة"],
      module: "STUDENTS",
      action: "DELETED",
      title: "تم حذف طالب",
      message: `تم حذف الطالب: ${deleted.firstname || ""} ${deleted.lastname || ""} (${deleted.tz})`,
      entity: { kind: "student", id: deleted._id },
      meta: { tz: deleted.tz },
      createdBy: req.user?._id || null,
    });

    return res.status(200).json({ ok: true, removed: true });
  } catch (err) {
    logWithSource("Student.deleteS", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

module.exports = {
  getAllS,
  getOneS,
  postS,
  putS,
  deleteS,
  uploadPhoto,
};
