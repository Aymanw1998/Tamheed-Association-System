const { StudentModelDef } = require("./Student.model");
const { logWithSource } = require("../../middleware/logger");
const { handleUpload, handleDeleteByUrl } = require("../UploadFile/file");
const { audit } = require("../../utils/audit");
const { LessonModelDef } = require("../Lesson/Lesson.model");
const { UserModelDef } = require("../User/User.model");
const { isSystemTz, can } = require("../../utils/permissions");
const { createStudentScope } = require("../../utils/studentScope");
const { checkVersion, editorStamp, sameVersion, raceLost } = require("../../middleware/lockGuard");
const { notifyChange, liveHub } = require("../../services/liveHub");
const { playerPhotoJob } = require("../../services/playerPhotoJob");

// Who the actor may see: null (students.viewAll) or a Set of student _ids.
const scope = createStudentScope({ lessonModel: LessonModelDef, studentModel: StudentModelDef });
const inScope = (visible, student) => !visible || visible.has(String(student?._id));
// A hidden student gets the same answer as a missing one (existence is not revealed).
const NOT_FOUND = { ok: false, message: "Student not found" };

// main_teacher (the responsible guide) names a user by _id: an active (approved) account that
// is not the system account. Only a 24-hex ObjectId is looked up.
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
async function isValidInstructor(id) {
  if (typeof id !== "string" || !OBJECT_ID.test(id)) return false;
  const found = await UserModelDef.get({ _id: id }, "active");
  const user = found?.result?.[0];
  return Boolean(user) && !isSystemTz(user.tz);
}
const INVALID_INSTRUCTOR = { ok: false, code: "INVALID_INSTRUCTOR", message: "المرشد المسؤول غير موجود" };
const hasValue = (v) => v !== undefined && v !== null && v !== "";
// Only a students.viewAll holder sets or changes main_teacher; for
// anyone else the field is ignored (not validated, not written).
const mayAssignInstructor = (actor) => can(actor, "students.viewAll");
// Parent-registration requests wait with this status until staff approve them.
const PENDING_STATUS = "ينتظر";

/* =============== Notifications (optional) =============== */
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
    logWithSource("Student.safeNotify", e);
  }
};

/* =============== helpers =============== */
// Central audit-log entry for a student change (called after the write).
const recordStudent = (req, action, before, after) => {
  const doc = after || before || {};
  return audit.record(req, {
    module: "students", action, targetType: "student",
    targetId: doc._id || doc.tz,
    targetLabel: `${doc.firstname || ""} ${doc.lastname || ""}`.trim() || doc.tz,
    before, after,
  });
};

function sanitize(u) {
  if (!u) return u;
  const o = { ...u };
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

const buildData = (body = {}) => ({
  tz: body.tz,
  firstname: body.firstname,
  lastname: body.lastname,
  birth_date: toDate(body.birth_date) || null,
  gender: body.gender,
  phone: body.phone,
  email: body.email || "",
  city: body.city || "",
  street: body.street || "",
  photo: body.photo || "",

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
  source: body.source || "جمعية",
  status: body.status || "عادي",
});

function removeEmpty(obj = {}) {
  const out = { ...obj };
  Object.keys(out).forEach((k) => {
    if (out[k] === undefined || out[k] === null || out[k] === "") {
      delete out[k];
    }
  });
  return out;
}

/* =============== CRUD =============== */

// GET /api/students
const getAllS = async (req, res) => {
  try {
    const [result, visible] = await Promise.all([StudentModelDef.get({}), scope.visibleStudentIds(req.actor)]);
    const students = (result?.result || []).filter((s) => inScope(visible, s));

    return res.status(200).json({
      ok: true,
      students: students.map(sanitize),
    });
  } catch (err) {
    logWithSource("Student.getAllS", err);
    return res.status(500).json({
      ok: false,
      students: [],
      message: err.message,
    });
  }
};

// GET /api/students/:tz
const getOneS = async (req, res) => {
  try {
    const tz = String(req.params.tz ?? "").trim();
    if (!tz) {
      return res.status(400).json({
        ok: false,
        message: "tz required",
      });
    }

    const result = await StudentModelDef.get({ tz });
    const visible = await scope.visibleStudentIds(req.actor);

    if (!result?.result?.length || !inScope(visible, result.result[0])) {
      return res.status(404).json({
        ok: false,
        message: "غير موجود",
      });
    }

    return res.status(200).json({
      ok: true,
      student: sanitize(result.result[0]),
    });
  } catch (err) {
    logWithSource("Student.getOneS", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

// POST /api/students
const postS = async (req, res) => {
  try {
    const model = buildData(req.body);
    const assigns = mayAssignInstructor(req.actor);
    // A creator without students.viewAll becomes the responsible guide, so he
    // keeps seeing the student he just added.
    if (!assigns) model.main_teacher = req.actor?.id != null ? String(req.actor.id) : null;

    if (!model.tz) {
      return res.status(400).json({
        ok: false,
        message: "tz required",
      });
    }

    if (!model.firstname || !model.lastname) {
      return res.status(400).json({
        ok: false,
        message: "firstname/lastname required",
      });
    }

    if (assigns && hasValue(req.body?.main_teacher) && !(await isValidInstructor(req.body.main_teacher))) {
      return res.status(400).json(INVALID_INSTRUCTOR);
    }

    const exists = await StudentModelDef.get({ tz: model.tz });
    if (exists?.result?.length) {
      return res.status(409).json({
        ok: false,
        message: "الطالب مسجّل مسبقًا",
      });
    }

    const created = await StudentModelDef.create({
      ...model,
      createdAt: new Date(),
    });
    await recordStudent(req, "create", null, created?.result || model);
    notifyChange("student", created?.result?._id);

    await safeNotify({
      toRoles: ["ادارة"],
      module: "STUDENTS",
      action: "CREATED",
      title: "تم إضافة طالب جديد",
      message: `تم إنشاء طالب: ${model.firstname} ${model.lastname} (${model.tz})`,
      meta: { tz: model.tz },
      createdBy: req.user?._id || null,
    });

    return res.status(201).json({
      ok: true,
      created,
    });
  } catch (err) {
    logWithSource("Student.postS", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

// PUT /api/students/:tz
const putS = async (req, res) => {
  try {
    const tz = String(req.params.tz ?? "").trim();

    if (!tz) {
      return res.status(400).json({
        ok: false,
        message: "tz required",
      });
    }

    const existing = await StudentModelDef.get({ tz });
    const visible = await scope.visibleStudentIds(req.actor);
    if (!existing?.result?.length || !inScope(visible, existing.result[0])) {
      return res.status(404).json(NOT_FOUND);
    }

    const assigns = mayAssignInstructor(req.actor);
    // Validated only when it changes: an unchanged stale value (inactive guide,
    // legacy id) must not block saving the other fields.
    const body = req.body || {};
    const changesInstructor = String(body.main_teacher ?? "") !== String(existing.result[0].main_teacher ?? "");
    if (assigns && changesInstructor && hasValue(body.main_teacher) && !(await isValidInstructor(body.main_teacher))) {
      return res.status(400).json(INVALID_INSTRUCTOR);
    }

    const newData = removeEmpty(buildData(req.body));
    if (!assigns) delete newData.main_teacher;
    // An explicit empty value from a viewAll holder clears the responsible guide.
    else if (req.body && Object.hasOwn(req.body, "main_teacher") && !hasValue(req.body.main_teacher)) newData.main_teacher = null;

    // A tz change may not take another student's ID number.
    if (newData.tz !== undefined && String(newData.tz).trim() !== tz) {
      const taken = await StudentModelDef.get({ tz: String(newData.tz).trim() });
      const own = String(existing.result[0]._id);
      if ((taken?.result || []).some((s) => String(s._id) !== own)) {
        return res.status(409).json({ ok: false, code: "TZ_EXISTS", message: "الطالب مسجّل مسبقًا" });
      }
    }

    const stale = checkVersion(existing.result[0], req);
    if (stale) return res.status(409).json(stale);
    newData.updatedAt = new Date();
    Object.assign(newData, editorStamp(req));
    // Written only if nobody saved since the student was read.
    const studentId = String(existing.result[0]._id);
    const updated = await StudentModelDef.updateExisting(
      sameVersion({ _id: studentId }, existing.result[0]),
      newData
    );
    if (!updated?.result) return res.status(409).json(await raceLost(() => StudentModelDef.get({ _id: studentId })));
    await recordStudent(req, "update", existing.result[0], { ...existing.result[0], ...newData });
    notifyChange("student", existing.result[0]._id);
    // A football player's name or photo shows on his own sport screen (a no-op when nobody listens).
    liveHub.toStudents([existing.result[0]._id], "me");
    if ("photo" in newData) playerPhotoJob.schedule(studentId);

    await safeNotify({
      toRoles: ["ادارة"],
      module: "STUDENTS",
      action: "UPDATED",
      title: "تم تعديل طالب",
      message: `تم تعديل بيانات الطالب (${tz})`,
      meta: { tz },
      createdBy: req.user?._id || null,
    });

    return res.status(200).json({
      ok: true,
      updated,
    });
  } catch (err) {
    logWithSource("Student.putS", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

// DELETE /api/students/:tz
const deleteS = async (req, res) => {
  try {
    const tz = String(req.params.tz ?? "").trim();

    if (!tz) {
      return res.status(400).json({
        ok: false,
        message: "tz is required",
      });
    }

    const existing = await StudentModelDef.get({ tz });
    const visible = await scope.visibleStudentIds(req.actor);
    if (!existing?.result?.length || !inScope(visible, existing.result[0])) {
      return res.status(404).json(NOT_FOUND);
    }

    // Only the record found above, never every record sharing the tz.
    const stale = checkVersion(existing.result[0], req);
    if (stale) return res.status(409).json(stale);
    const deleted = await StudentModelDef.delete(sameVersion({ _id: String(existing.result[0]._id) }, existing.result[0]));
    if (!deleted?.result?.deletedCount) return res.status(409).json(await raceLost(() => StudentModelDef.get({ _id: String(existing.result[0]._id) })));
    await recordStudent(req, "delete", existing.result[0], null);
    notifyChange("student", existing.result[0]._id);
    // Its player photo goes with it, at once.
    await playerPhotoJob.remove(existing.result[0]._id).catch((e) => logWithSource("Student.delete.playerPhoto", e));

    // Rejecting a waiting-list request or deleting a student also removes the
    // photo from Drive, so no orphaned files stay behind.
    const photo = existing.result[0]?.photo;
    if (photo) {
      await handleDeleteByUrl(photo);
    }

    await safeNotify({
      toRoles: ["ادارة"],
      module: "STUDENTS",
      action: "DELETED",
      title: "تم حذف طالب",
      message: `تم حذف الطالب (${tz})`,
      meta: { tz },
      createdBy: req.user?._id || null,
    });

    return res.status(200).json({
      ok: true,
      deleted,
    });
  } catch (err) {
    logWithSource("Student.deleteS", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

// POST /api/students/:tz/photo
const uploadPhoto = async (req, res) => {
  try {
    const tz = String(req.params.tz ?? "").trim();

    if (!tz) {
      return res.status(400).json({
        ok: false,
        message: "tz is required",
      });
    }

    const existing = await StudentModelDef.get({ tz });
    const visible = await scope.visibleStudentIds(req.actor);
    if (!existing?.result?.length || !inScope(visible, existing.result[0])) {
      return res.status(404).json(NOT_FOUND);
    }

    const student = existing.result[0];

    if (!req.file) {
      return res.status(400).json({
        ok: false,
        message: "file is required",
      });
    }

    const uploaded = await handleUpload(
      req.file,
      StudentModelDef.dbName,
      StudentModelDef.collections.active,
      student.tz
    );
    if (!uploaded?.secure_url) {
      return res.status(502).json({
        ok: false,
        message: "تعذّر رفع الصورة إلى Google Drive، ولم تتغير الصورة الحالية",
      });
    }

    await StudentModelDef.update(
      { tz },
      { photo: uploaded.secure_url, updatedAt: new Date() }
    );
    await recordStudent(req, "update", student, { ...student, photo: uploaded.secure_url });
    notifyChange("student", student._id);
    liveHub.toStudents([student._id], "me");
    playerPhotoJob.schedule(student._id);

    // The previous Drive file is removed only after the new link is stored,
    // so a failed upload never leaves the record pointing at a deleted file.
    if (student.photo) {
      await handleDeleteByUrl(student.photo);
    }

    return res.status(200).json({
      ok: true,
      photo: uploaded.secure_url,
    });
  } catch (err) {
    logWithSource("Student.uploadPhoto", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

async function getStudentInRoomByTz(tz, room) {
  try{
    const result = await StudentModelDef.get({ tz }, room).catch(() => null);
    const result2 = await StudentModelDef.get({ _id: tz }, room).catch(() => null);
    console.log(`getStudentInRoomByTz - tz: ${tz}, room: ${room}, result:`, result);
    console.log(`getStudentInRoomByTz - tz: ${tz}, room: ${room}, result2:`, result2);
    if (result?.success && Array.isArray(result.result) && result.result.length > 0) {
      return result.result[0];
    }
    if (result2?.success && Array.isArray(result2.result) && result2.result.length > 0) {
      return result2.result[0];
    }
    return null;
  } catch (error) {
    logWithSource("Student.getStudentInRoomByTz", error);
    return null;
  }
}

const deletePhoto = async (req, res) => {
  try {
    const tz = String(req.params.tz ?? "").trim();
    if (!tz) {
      return res.status(400).json({ ok: false, message: "tz is required" });
    }

    const user = await getStudentInRoomByTz(tz, "active");
    const visible = await scope.visibleStudentIds(req.actor);
    if (!user || !inScope(visible, user)) {
      return res.status(404).json({ ok: false, message: "Student not found" });
    }

    console.log("Deleting photo for user:", user.tz, "Photo URL:", user.photo);
    if (user.photo) {
      try {
        await handleDeleteByUrl(user.photo);
      } catch (e) {
        logWithSource("Student.deletePhoto delete file", e);
      }
    }
    console.warn("Updating student record to remove photo URL");
    await StudentModelDef.update(
      { tz },
      { photo: null, updatedAt: new Date() },
      "active"
    );
    await recordStudent(req, "update", user, { ...user, photo: null });
    notifyChange("student", user._id);
    liveHub.toStudents([user._id], "me");
    // No photo, no player photo: removed at once; the job then clears the mark.
    await playerPhotoJob.remove(user._id).catch((e) => logWithSource("Student.deletePhoto.playerPhoto", e));
    playerPhotoJob.schedule(user._id);
    console.warn("Student record updated, sending notification");
    await safeNotify({
      toRoles: ["ادارة"],
      module: "STUDENTS",
      action: "PHOTO_DELETED",
      title: "تم حذف صورة طالب",
      message: `تم حذف صورة الطالب: ${user.firstname || ""} ${user.lastname || ""} (${user.tz})`,
      meta: { tz: user.tz, photo: false },
      createdBy: req.user?._id || null,
    });

    return res.status(200).json({
      ok: true,
      photo: null,
      deleted: true,
    });
  } catch (err) {
    logWithSource("Student.deletePhoto", err);
    return res.status(500).json({
      ok: false,
      message: err.message,
    });
  }
};

// GET /api/student/lookup/:tz  (lessons.roster)
// Lets a guide find a student he cannot see, to add to a roster: exact, full
// tz match only (no partial or pattern search), and only the identifying
// fields plus the _id the roster needs.
const lookupS = async (req, res) => {
  try {
    const tz = String(req.params.tz ?? "").trim();
    const result = tz ? await StudentModelDef.get({ tz }) : null;
    const student = (result?.result || []).find((s) => String(s.tz) === tz);
    // A scoped actor never finds a student still on the waiting list.
    const waiting = student && student.status === PENDING_STATUS && !can(req.actor, "students.viewAll");
    if (!student || waiting) return res.status(404).json({ ok: false, message: "غير موجود" });
    return res.status(200).json({
      ok: true,
      student: {
        tz: String(student.tz),
        firstname: student.firstname || "",
        lastname: student.lastname || "",
        _id: String(student._id),
      },
    });
  } catch (err) {
    logWithSource("Student.lookupS", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

module.exports = {
  lookupS,
  getAllS,
  getOneS,
  postS,
  putS,
  deleteS,
  uploadPhoto,
  deletePhoto,
};
// OLD CODE - DO NOT SUGGEST
// // Entities/User/user.controller.js
// const PdfPrinter = require("pdfmake");
// const fs = require("fs");
// const path = require("path");
// const axios = require("axios");

// const Student = require("./Student.model");
// const InviteToken = require("../InviteToken/InviteToken.model"); // إذا بتحتاجه لاحقاً
// const { logWithSource } = require("../../middleware/logger");
// const { handleUpload, handleDeleteByUrl } = require("../UploadFile/file");

// /* =============== Notifications (optional) =============== */
// let notify = null;
// try {
//   ({ notify } = require("../Notification/Notification.controller")); // عدّل المسار إذا لازم
// } catch (e) {
//   notify = null;
// }
// const safeNotify = async (payload) => {
//   try {
//     if (typeof notify === "function") await notify(payload);
//   } catch (e) {
//     logWithSource("Student.safeNotify", e);
//   }
// };

// /* =============== helpers =============== */
// // remove sensitive fields
// function sanitize(u) {
//   if (!u) return u;
//   const o = u.toObject ? u.toObject() : u;
//   delete o.password;
//   delete o.refreshHash;
//   return o;
// }

// function toDate(value) {
//   if (!value) return null;
//   if (value instanceof Date) return value;
//   if (typeof value === "number") return new Date(value);

//   if (typeof value === "string") {
//     const s = value.trim();

//     // dd-mm-yyyy or dd/mm/yyyy
//     let m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
//     if (m) {
//       const [, dd, mm, yyyy] = m.map(Number);
//       return new Date(Date.UTC(yyyy, mm - 1, dd));
//     }

//     // yyyy-mm-dd
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

// const infoKeys = [
//   "tz","firstname","lastname","birth_date","gender","phone","email","city","street",
//   "father_name","mother_name","father_phone","mother_phone","father_work","mother_work",
//   "school","layer","health_status","notes","main_teacher","photo"
// ];

// const buildData = (body = {}) => ({
//   tz: body.tz,
//   firstname: body.firstname,
//   lastname: body.lastname,
//   birth_date: toDate(body.birth_date) || null,
//   gender: body.gender,
//   phone: body.phone,
//   email: body.email || "test@test.com",
//   city: body.city || "الرملة",
//   street: body.street || "الرملة القديمة",
//   father_name: body.father_name,
//   mother_name: body.mother_name,
//   father_phone: body.father_phone,
//   mother_phone: body.mother_phone,
//   father_work: body.father_work,
//   mother_work: body.mother_work,
//   school: body.school,
//   layer: body.layer,
//   health_status: body.health_status || "",
//   notes: body.notes || "",
//   main_teacher: body.main_teacher || null,
// });

// /* =============== CRUD =============== */

// // GET /api/students
// const getAllS = async (req, res) => {
//   try {
//     const students = await Student.find({}).lean();
//     return res.status(200).json({ ok: true, students: students.map(sanitize) });
//   } catch (err) {
//     logWithSource("Student.getAllS", err);
//     return res.status(500).json({ ok: false, students: [], message: err.message });
//   }
// };

// // GET /api/students/:tz
// const getOneS = async (req, res) => {
//   try {
//     logWithSource("Student.getOneS params", req.params);
//     const tzParam = String(req.params.tz ?? "").trim();
//     if (!tzParam) return res.status(400).json({ ok: false, message: "tz required" });

//     // ✅ FIX: let (مش const)
//     let student = await Student.findOne({ tz: tzParam }).lean();
//     if (!student) return res.status(404).json({ ok: false, message: "غير موجود" });

//     return res.status(200).json({ ok: true, student: sanitize(student) });
//   } catch (err) {
//     logWithSource("Student.getOneS", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// // POST /api/students
// const postS = async (req, res) => {
//   try {
//     const model = buildData(req.body);

//     if (!model.tz) return res.status(400).json({ ok: false, message: "tz required" });
//     if (!model.firstname || !model.lastname) {
//       return res.status(400).json({ ok: false, message: "firstname/lastname required" });
//     }

//     const exists = await Student.findOne({ tz: String(model.tz).trim() }).lean();
//     if (exists) return res.status(409).json({ ok: false, message: "المستخدم موجود" });

//     const created = await Student.create({ ...model, createdAt: new Date() });

//     // ✅ notify admins
//     await safeNotify({
//       toRoles: ["ادارة"],
//       module: "STUDENTS",
//       action: "CREATED",
//       title: "تم إضافة طالب جديد",
//       message: `تم إنشاء طالب: ${created.firstname || ""} ${created.lastname || ""} (${created.tz})`,
//       entity: { kind: "student", id: created._id },
//       meta: { tz: created.tz },
//       createdBy: req.user?._id || null,
//     });

//     return res.status(201).json({ ok: true, student: sanitize(created) });
//   } catch (err) {
//     logWithSource("Student.postS", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// // PUT /api/students/:tz
// const putS = async (req, res) => {
//   try {
//     const tz = String(req.params.tz ?? "").trim();
//     if (!tz) return res.status(400).json({ ok: false, message: "tz required" });

//     const studentDoc = await Student.findOne({ tz });
//     if (!studentDoc) return res.status(404).json({ ok: false, message: "Student not found" });

//     const allowed =
//       Student.schema ? new Set(Object.keys(Student.schema.paths)) : new Set(infoKeys);

//     const body = req.body ?? {};

//     let changed = false;

//     for (const [k, v] of Object.entries(body)) {
//       if (!allowed.has(k)) continue;

//       // ✅ FIX null/undefined/"" handling
//       if (v === undefined || v === null || v === "") continue;

//       // ✅ parse birth_date if sent
//       if (k === "birth_date") {
//         const d = toDate(v);
//         if (!d) continue;
//         studentDoc.set(k, d);
//         changed = true;
//         continue;
//       }

//       studentDoc.set(k, v);
//       changed = true;
//     }

//     if (!changed) {
//       return res.status(200).json({ ok: true, student: sanitize(studentDoc), message: "no changes" });
//     }

//     await studentDoc.save();

//     // ✅ notify admins
//     await safeNotify({
//       toRoles: ["ادارة"],
//       module: "STUDENTS",
//       action: "UPDATED",
//       title: "تم تعديل طالب",
//       message: `تم تعديل بيانات الطالب: ${studentDoc.firstname || ""} ${studentDoc.lastname || ""} (${studentDoc.tz})`,
//       entity: { kind: "student", id: studentDoc._id },
//       meta: { tz: studentDoc.tz },
//       createdBy: req.user?._id || null,
//     });

//     return res.status(200).json({ ok: true, student: sanitize(studentDoc) });
//   } catch (err) {
//     logWithSource("Student.putS", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// // POST /api/students/:tz/photo
// const uploadPhoto = async (req, res) => {
//   try {
//     const tz = String(req.params.tz ?? "").trim();
//     if (!tz) return res.status(400).json({ ok: false, message: "tz is required" });

//     const student = await Student.findOne({ tz });
//     if (!student) return res.status(404).json({ ok: false, message: "Student not found" });

//     if (!req.file) return res.status(400).json({ ok: false, message: "file is required" });

//     // delete previous
//     if (student.photo) {
//       try {
//         await handleDeleteByUrl(student.photo);
//       } catch (e) {
//         logWithSource("Student.uploadPhoto delete prev", e);
//       }
//     }

//     const uploaded = await handleUpload(req.file, process.env.DB_NAME, "students");
//     student.photo = uploaded.secure_url;
//     await student.save();

//     // ✅ notify admins
//     await safeNotify({
//       toRoles: ["ادارة"],
//       module: "STUDENTS",
//       action: "PHOTO_UPDATED",
//       title: "تم تحديث صورة طالب",
//       message: `تم تحديث صورة الطالب: ${student.firstname || ""} ${student.lastname || ""} (${student.tz})`,
//       entity: { kind: "student", id: student._id },
//       meta: { tz: student.tz, photo: true },
//       createdBy: req.user?._id || null,
//     });

//     return res.status(200).json({ ok: true, photo: student.photo });
//   } catch (err) {
//     logWithSource("Student.uploadPhoto", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// // DELETE /api/students/:tz
// const deleteS = async (req, res) => {
//   try {
//     const tz = String(req.params.tz ?? "").trim();
//     if (!tz) return res.status(400).json({ ok: false, message: "tz is required" });

//     const deleted = await Student.findOneAndDelete({ tz });
//     if (!deleted) return res.status(404).json({ ok: false, message: "Student not found" });

//     // ✅ notify admins
//     await safeNotify({
//       toRoles: ["ادارة"],
//       module: "STUDENTS",
//       action: "DELETED",
//       title: "تم حذف طالب",
//       message: `تم حذف الطالب: ${deleted.firstname || ""} ${deleted.lastname || ""} (${deleted.tz})`,
//       entity: { kind: "student", id: deleted._id },
//       meta: { tz: deleted.tz },
//       createdBy: req.user?._id || null,
//     });

//     return res.status(200).json({ ok: true, removed: true });
//   } catch (err) {
//     logWithSource("Student.deleteS", err);
//     return res.status(500).json({ ok: false, message: err.message });
//   }
// };

// module.exports = {
//   getAllS,
//   getOneS,
//   postS,
//   putS,
//   deleteS,
//   uploadPhoto,
// };
