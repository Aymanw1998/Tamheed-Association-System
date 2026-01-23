// Attendance.controller.js (SERVER) ✅ Fixed + Notifications integrated
const mongoose = require("mongoose");
const Attendance = require("./Attendance.model");
const { logWithSource } = require("../../middleware/logger");

// ✅ if you created a generic notifications service:
let notify = null;
try {
  ({ notify } = require("../Notification/Notification.controller")); // adjust path if needed
} catch (e) {
  // if notifications service not installed yet, controller still works
  notify = null;
}

/* ===================== Helpers ===================== */
const toInt = (v, def = 0) => (Number.isFinite(Number(v)) ? Number(v) : def);

// ✅ FIXED clamp
const clamp = (num, min, max) => Math.max(min, Math.min(num, max));

const toDateKey = (y, m, d) => Number(y) * 10000 + Number(m) * 100 + Number(d);

const safeNotify = async (payload) => {
  try {
    if (typeof notify === "function") await notify(payload);
  } catch (e) {
    // don't break main flow because of notification failure
    logWithSource("Attendance.safeNotify", e);
  }
};

/* ===================== Builders ===================== */
const buildAttendanceDoc = ({ lessonId, studentId, year, month, day, status, notes }) => {
  const y = toInt(year);
  const m = toInt(month);
  const d = toInt(day);

  const dateKey = toDateKey(y, m, d);

  return {
    lesson: lessonId || null,
    student: studentId || null,
    year: y,
    month: m,
    day: d,
    dateKey,
    status: status ?? "",
    notes: notes ?? "",
  };
};

/* ===================== Controllers ===================== */

// ✅ GET /api/attendance?year=&month=&day=
const getAll = async (req, res) => {
  try {
    const { year, month, day } = req.query; // ✅ should be query (not params)
    const filter = {};

    const y = Number(year);
    const m = Number(month);
    const d = Number(day);

    if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
      filter.dateKey = toDateKey(y, m, d);
    } else if (!Number.isNaN(y) && !Number.isNaN(m)) {
      // optional: get whole month
      const start = toDateKey(y, m, 1);
      const end = toDateKey(y, m, 31);
      filter.dateKey = { $gte: start, $lte: end };
    } else if (!Number.isNaN(y)) {
      // optional: get whole year
      const start = toDateKey(y, 1, 1);
      const end = toDateKey(y, 12, 31);
      filter.dateKey = { $gte: start, $lte: end };
    }

    const attendances = await Attendance.find(filter).lean();
    return res.status(200).json({ ok: true, attendances });
  } catch (err) {
    logWithSource("Attendance.getAll", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// ✅ GET /api/attendance/query?lessonId=&year=&month=&day=
const getAttendancesByQuery = async (req, res) => {
  try {
    const { lessonId, year, month, day } = req.query;

    const filter = {};
    if (lessonId) filter.lesson = lessonId;

    const y = Number(year);
    const m = Number(month);
    const d = Number(day);

    if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
      filter.dateKey = toDateKey(y, m, d);
    }

    const [items, total] = await Promise.all([
      Attendance.find(filter)
        .select("lesson student status notes day month year dateKey")
        .populate("student", "firstname lastname")
        .lean(),
      Attendance.countDocuments(filter),
    ]);

    return res.json({ ok: true, attendances: items, total });
  } catch (e) {
    logWithSource("Attendance.getAttendancesByQuery", e);
    return res.status(500).json({ ok: false, message: e.message });
  }
};

// ✅ GET /api/attendance/:id  (Mongo _id)
const getOne = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, message: "invalid id" });
    }

    const attendance = await Attendance.findById(id)
      .populate("student", "firstname lastname")
      .lean();

    if (!attendance) return res.status(404).json({ ok: false, message: "לא נמצא" });
    return res.status(200).json({ ok: true, attendance });
  } catch (err) {
    logWithSource("Attendance.getOne", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// ✅ GET /api/attendance/byLesson/:lesson_id/:day/:month/:year
const getAllByLessonDayMonthYear = async (req, res) => {
  try {
    const { lesson_id, day, month, year } = req.params;

    const y = toInt(year);
    const m = toInt(month);
    const d = toInt(day);

    const filter = {
      lesson: lesson_id,
      dateKey: toDateKey(y, m, d),
    };

    const attendances = await Attendance.find(filter)
      .populate("student", "firstname lastname")
      .lean();

    return res.status(200).json({ ok: true, attendances });
  } catch (err) {
    logWithSource("Attendance.getAllByLessonDayMonthYear", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// ✅ POST /api/attendance  (UPSERT single)
const postOne = async (req, res) => {
  try {
    const { lessonId, studentId, year, month, day, status, notes } = req.body;

    if (!lessonId || !studentId || year === undefined || month === undefined || day === undefined) {
      return res.status(400).json({ ok: false, message: "missing fields" });
    }

    const docData = buildAttendanceDoc({ lessonId, studentId, year, month, day, status, notes });

    const doc = await Attendance.findOneAndUpdate(
      { lesson: docData.lesson, student: docData.student, dateKey: docData.dateKey },
      { $set: docData },
      { new: true, upsert: true }
    ).populate("student", "firstname lastname");

    // ✅ Notification to admins
    await safeNotify({
      toRoles: ["ادارة"],
      module: "ATTENDANCE",
      action: "UPSERT",
      type: "SUCCESS",
      title: "تحديث حضور/غياب",
      message: `تم تحديث حضور الطالب ${(doc?.student?.firstname || "")} ${(doc?.student?.lastname || "")}`.trim(),
      entity: { kind: "attendance", id: doc._id },
      meta: {
        lessonId,
        studentId,
        year: docData.year,
        month: docData.month,
        day: docData.day,
        dateKey: docData.dateKey,
        status: docData.status,
        notes: docData.notes,
      },
      createdBy: req.user?._id || null,
    });

    return res.json({ ok: true, attendance: doc });
  } catch (e) {
    logWithSource("Attendance.postOne", e);
    return res.status(500).json({ ok: false, message: e.message });
  }
};

// ✅ POST /api/attendance/byLesson/:lesson_id/:day/:month/:year (BULK UPSERT)
const postByLessonDayMonthYear = async (req, res) => {
  try {
    const { lesson_id, day, month, year } = req.params;
    const list_attendance = req.body; // [{student,status,notes},...]

    if (!Array.isArray(list_attendance) || list_attendance.length === 0) {
      return res.status(400).json({ ok: false, message: "missing required fields" });
    }

    const y = toInt(year);
    const m = toInt(month);
    const d = toInt(day);
    const dateKey = toDateKey(y, m, d);

    // ✅ efficient bulkWrite
    const ops = list_attendance.map((item) => {
      const data = buildAttendanceDoc({
        lessonId: lesson_id,
        studentId: item.student,
        year: y,
        month: m,
        day: d,
        status: item.status,
        notes: item.notes,
      });

      return {
        updateOne: {
          filter: { lesson: lesson_id, student: item.student, dateKey },
          update: { $set: data },
          upsert: true,
        },
      };
    });

    await Attendance.bulkWrite(ops, { ordered: false });

    const attendances = await Attendance.find({ lesson: lesson_id, dateKey })
      .populate("student", "firstname lastname")
      .lean();

    // ✅ Notification summary (one notification, not many)
    await safeNotify({
      toRoles: ["ادارة"],
      module: "ATTENDANCE",
      action: "BULK_UPSERT",
      type: "SUCCESS",
      title: "تحديث حضور مجموعة",
      message: `تم تحديث حضور ${attendances.length} طلاب للدرس`,
      entity: { kind: "lesson", id: lesson_id },
      meta: { lessonId: lesson_id, year: y, month: m, day: d, dateKey, count: attendances.length },
      createdBy: req.user?._id || null,
    });

    return res.status(201).json({ ok: true, attendances });
  } catch (err) {
    logWithSource("Attendance.postByLessonDayMonthYear", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// ✅ PUT /api/attendance/:id  (update single by _id)
const putOne = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, message: "invalid id" });
    }

    const current = await Attendance.findById(id);
    if (!current) return res.status(404).json({ ok: false, message: "לא נמצא" });

    // only allow status/notes update here (simpler + safer)
    if (req.body.status !== undefined) current.status = req.body.status;
    if (req.body.notes !== undefined) current.notes = req.body.notes;

    current.updatedAt = new Date();
    await current.save();

    await safeNotify({
      toRoles: ["ادارة"],
      module: "ATTENDANCE",
      action: "UPDATED",
      type: "SUCCESS",
      title: "تعديل سجل حضور",
      message: `تم تعديل سجل حضور`,
      entity: { kind: "attendance", id: current._id },
      meta: { status: current.status, notes: current.notes, dateKey: current.dateKey, lesson: current.lesson, student: current.student },
      createdBy: req.user?._id || null,
    });

    return res.status(200).json({ ok: true, attendance: current });
  } catch (err) {
    logWithSource("Attendance.putOne", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// ✅ DELETE /api/attendance/:id  (delete by _id)
const deleteOne = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, message: "invalid id" });
    }

    const deleted = await Attendance.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ ok: false, message: "לא נמצא" });

    await safeNotify({
      toRoles: ["ادارة"],
      module: "ATTENDANCE",
      action: "DELETED",
      type: "WARN",
      title: "حذف سجل حضور",
      message: `تم حذف سجل حضور`,
      entity: { kind: "attendance", id: deleted._id },
      meta: { dateKey: deleted.dateKey, lesson: deleted.lesson, student: deleted.student },
      createdBy: req.user?._id || null,
    });

    return res.status(200).json({ ok: true, removed: true });
  } catch (err) {
    logWithSource("Attendance.deleteOne", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// ✅ DELETE /api/attendance/deletePerMonth/:month/:year
const deletePerMonth = async (req, res) => {
  try {
    const { month, year } = req.params;

    const m = Number(month);
    const y = Number(year);
    if (Number.isNaN(m) || Number.isNaN(y)) {
      return res.status(400).json({ ok: false, message: "invalid month/year" });
    }

    const result = await Attendance.deleteMany({ month: m, year: y });

    await safeNotify({
      toRoles: ["ادارة"],
      module: "ATTENDANCE",
      action: "BULK_DELETED",
      type: "WARN",
      title: "حذف حضور بالشهر",
      message: `تم حذف ${result.deletedCount} سجلات حضور لشهر ${m}/${y}`,
      entity: { kind: "attendance", id: null },
      meta: { month: m, year: y, deletedCount: result.deletedCount },
      createdBy: req.user?._id || null,
    });

    return res.status(200).json({ ok: true, deletedCount: result.deletedCount });
  } catch (err) {
    logWithSource("Attendance.deletePerMonth", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// ✅ GET /api/attendance/history?studentId=&lessonId=&from=YYYY-MM-DD&to=YYYY-MM-DD&status=
const getHistory = async (req, res) => {
  try {
    const { studentId, lessonId, from, to, status } = req.query;

    const filter = {};
    if (studentId) filter.student = studentId;
    if (lessonId) filter.lesson = lessonId;
    if (status) filter.status = status;

    if (from || to) {
      filter.dateKey = {};
      if (from) {
        const [fy, fm, fd] = from.split("-").map(Number);
        filter.dateKey.$gte = toDateKey(fy, fm, fd);
      }
      if (to) {
        const [ty, tm, td] = to.split("-").map(Number);
        filter.dateKey.$lte = toDateKey(ty, tm, td);
      }
    }

    const list = await Attendance.find(filter)
      .populate("student", "firstname lastname")
      .populate("lesson", "name")
      .sort({ dateKey: -1, lesson: 1 })
      .lean();

    return res.json({ ok: true, attendances: list });
  } catch (e) {
    logWithSource("Attendance.getHistory", e);
    return res.status(500).json({ ok: false, message: e.message });
  }
};

module.exports = {
  getAll,
  getOne,
  getHistory,
  getAttendancesByQuery,
  getAllByLessonDayMonthYear,
  postOne,
  postByLessonDayMonthYear,
  putOne,
  deleteOne,
  deletePerMonth,
};
