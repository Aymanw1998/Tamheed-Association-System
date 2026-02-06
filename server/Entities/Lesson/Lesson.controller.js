// Lesson.controller.js (SERVER) ✅ Full fixed version + optional notifications

const { logWithSource } = require("../../middleware/logger");
const Lesson = require("./Lesson.model");
const mongoose = require("mongoose");

/* ===================== Optional Notifications ===================== */
// if you have services/notify.js export { notify }, it will work.
// if not, it won't crash.
let notify = null;
try {
  ({ notify } = require("../Notification/Notification.controller")); // adjust path if needed
} catch (e) {
  notify = null;
}
const safeNotify = async (payload) => {
  try {
    if (typeof notify === "function") await notify(payload);
  } catch (e) {
    logWithSource("Lesson.safeNotify", e);
  }
};

/* ===================== Helpers ===================== */
const toInt = (value, defaultValue = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : defaultValue;

const clamp = (num, min, max) => Math.max(min, Math.min(num, max));

const sameRoom = (aRoom, bRoom) => String(aRoom ?? "0") === String(bRoom ?? "0");
const overlapTime = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

// ✅ conflict = time overlap AND (same room OR same teacher OR same helper)
function isConflict(next, existing) {
  const aStart = toInt(next?.date?.startMin);
  const aEnd   = toInt(next?.date?.endMin);
  const bStart = toInt(existing?.date?.startMin);
  const bEnd   = toInt(existing?.date?.endMin);

  if (!overlapTime(aStart, aEnd, bStart, bEnd)) return false;

  const roomConflict = sameRoom(next.room, existing.room);

  const teacherConflict =
    next.teacher && existing.teacher && String(next.teacher) === String(existing.teacher);

  const helperConflict =
    next.helper && existing.helper && String(next.helper) === String(existing.helper);

  return roomConflict || teacherConflict || helperConflict;
}

const buildLessonData = (body) => {
  const day = toInt(body?.date?.day, 1);

  const startMin = clamp(toInt(body?.date?.startMin, 9 * 60), 0, 24 * 60 - 1);
  const endMinRaw = toInt(body?.date?.endMin, startMin + 45);
  const endMin = clamp(Math.max(endMinRaw, startMin + 1), 1, 24 * 60);

  return {
    name: body?.name ?? "",
    date: { day, startMin, endMin },
    teacher: body?.teacher || null,
    helper: body?.helper || null,
    room: body?.room ?? "0",
    list_students: Array.isArray(body?.list_students) ? body.list_students : [],
  };
};

/* ===================== Controllers ===================== */

const getAll = async (req, res) => {
  try {
    const lessons = await Lesson.find().lean();
    return res.status(200).json({ ok: true, lessons });
  } catch (err) {
    logWithSource("Lesson.getAll", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

const getOne = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ ok: false, message: "invalid id" });

    const lesson = await Lesson.findById(id);
    if (!lesson) return res.status(404).json({ ok: false, message: "לא נמצא" });

    lesson.num_in_list = (lesson.list_students || []).length;
    return res.status(200).json({ ok: true, lesson });
  } catch (err) {
    logWithSource("Lesson.getOne", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

// ✅ GET /api/lessons/query?day=&teacher=&helper=&room=
const getLessonsByQuery = async (req, res) => {
  try {
    const { day, teacher, helper, room } = req.query;

    const filter = {};
    if (day !== undefined && day !== "") filter["date.day"] = Number(day);
    if (teacher) filter.teacher = teacher;
    if (helper) filter.helper = helper;
    if (room !== undefined && room !== "") filter.room = String(room);

    const [items, total] = await Promise.all([
      Lesson.find(filter)
        .populate("teacher", "_id tz firstname lastname roles")
        .populate("helper", "_id tz firstname lastname roles")
        .lean(),
      Lesson.countDocuments(filter),
    ]);

    return res.status(200).json({
      ok: true,
      lessons: items,
      pagination: { total },
    });
  } catch (err) {
    logWithSource("Lesson.getLessonsByQuery", err);
    return res.status(500).json({
      ok: false,
      message: "يوجد خطأ في جلب البيانات المطلوبة",
    });
  }
};

const postOne = async (req, res) => {
  try {
    const model = buildLessonData(req.body);

    if (!model?.name || !model?.teacher) {
      return res.status(400).json({ ok: false, message: "missing required fields" });
    }

    // ✅ Only possible conflicts: same day AND (same room OR same teacher OR same helper)
    const sameDay = await Lesson.find({
      "date.day": model.date.day,
      $or: [
        { room: model.room },
        { teacher: model.teacher },
        ...(model.helper ? [{ helper: model.helper }] : []),
      ],
    }).lean();

    const conflict = sameDay.some((l) => isConflict(model, l));
    if (conflict) {
      return res.status(409).json({
        ok: false,
        message: "يوجد تعارض في الساعات (غرفة/مرشد/مساعد)",
      });
    }

    const doc = await Lesson.create({ ...model });
    doc.num_in_list = (doc.list_students || []).length;

    // ✅ notify admins (optional)
    await safeNotify({
      toRoles: ["ادارة"],
      module: "LESSONS",
      action: "CREATED",
      title: "تم إضافة درس جديد",
      message: `تم إنشاء درس: ${doc.name}`,
      entity: { kind: "lesson", id: doc._id },
      meta: {
        day: doc.date.day,
        startMin: doc.date.startMin,
        endMin: doc.date.endMin,
        room: doc.room,
        teacher: doc.teacher,
        helper: doc.helper,
      },
      createdBy: req.user?._id || doc.teacher || null,
    });

    return res.status(201).json({ ok: true, lesson: doc });
  } catch (err) {
    logWithSource("Lesson.postOne", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

const putOne = async (req, res) => {
  try {
    const { id } = req.params;
    console.log(req.body);
    const current = await Lesson.findById(id);
    if (!current) return res.status(404).json({ ok: false, message: "לא נמצא" });

    const next = buildLessonData({ ...current.toObject(), ...req.body });

    const changedSlot =
      next.date.day !== current.date.day ||
      next.date.startMin !== current.date.startMin ||
      next.date.endMin !== current.date.endMin ||
      String(next.teacher) !== String(current.teacher) ||
      String(next.helper) !== String(current.helper) ||
      String(next.room) !== String(current.room);

    if (changedSlot) {
      const sameDay = await Lesson.find({
        _id: { $ne: current._id },
        "date.day": next.date.day,
        $or: [
          { room: next.room },
          { teacher: next.teacher },
          ...(next.helper ? [{ helper: next.helper }] : []),
        ],
      }).lean();

      const conflict = sameDay.some((l) => isConflict(next, l));
      if (conflict) {
        return res.status(409).json({
          ok: false,
          message: "يوجد تعارض في الساعات (غرفة/مرشد/مساعد)",
        });
      }
    }

    current.name = next.name;
    current.date.day = next.date.day;
    current.date.startMin = next.date.startMin;
    current.date.endMin = next.date.endMin;
    current.teacher = next.teacher;
    current.helper = next.helper;
    current.list_students = next.list_students;
    current.room = next.room;
    current.updatedAt = new Date();

    await current.save();

    // ✅ notify admins (optional)
    await safeNotify({
      toRoles: ["ادارة"],
      module: "LESSONS",
      action: "UPDATED",
      title: "تم تعديل درس",
      message: `تم تعديل درس: ${current.name}`,
      entity: { kind: "lesson", id: current._id },
      meta: {
        day: current.date.day,
        startMin: current.date.startMin,
        endMin: current.date.endMin,
        room: current.room,
        teacher: current.teacher,
        helper: current.helper,
      },
      createdBy: req.user?._id || current.teacher || null,
    });

    return res.status(200).json({ ok: true, lesson: current });
  } catch (err) {
    logWithSource("Lesson.putOne", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

const deleteOne = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id))
      return res.status(400).json({ ok: false, message: "invalid id" });

    const deleted = await Lesson.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ ok: false, message: "לא נמצא" });

    await safeNotify({
      toRoles: ["ادارة"],
      module: "LESSONS",
      action: "DELETED",
      title: "تم حذف درس",
      message: `تم حذف درس: ${deleted.name}`,
      entity: { kind: "lesson", id: deleted._id },
      meta: {
        day: deleted.date?.day,
        startMin: deleted.date?.startMin,
        endMin: deleted.date?.endMin,
        room: deleted.room,
        teacher: deleted.teacher,
        helper: deleted.helper,
      },
      createdBy: req.user?._id || deleted.teacher || null,
    });

    return res.status(200).json({ ok: true, removed: true });
  } catch (err) {
    logWithSource("Lesson.deleteOne", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

const addToList = async (req, res) => {
  try {
    const { id } = req.params;
    const { list_students } = req.body;

    if (!Array.isArray(list_students) || list_students.length === 0)
      return res.status(400).json({ ok: false, message: "list_students is empty" });

    const lesson = await Lesson.findById(id);
    if (!lesson) return res.status(404).json({ ok: false, message: "לא נמצא" });

    const set = new Set((lesson.list_students || []).map(String));
    const toAdd = list_students.filter((t) => t != null && !set.has(String(t)));

    lesson.list_students.push(...toAdd);
    lesson.list_students = lesson.list_students.filter((t) => t != null);
    lesson.updatedAt = new Date();
    await lesson.save();

    await safeNotify({
      toRoles: ["ادارة"],
      module: "LESSONS",
      action: "STUDENTS_ADDED",
      title: "تحديث قائمة الطلاب",
      message: `تم إضافة ${toAdd.length} طلاب لدرس: ${lesson.name}`,
      entity: { kind: "lesson", id: lesson._id },
      meta: { addedCount: toAdd.length },
      createdBy: req.user?._id || lesson.teacher || null,
    });

    lesson.num_in_list = (lesson.list_students || []).length;
    return res.status(200).json({ ok: true, lesson });
  } catch (err) {
    logWithSource("Lesson.addToList", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

const removeFromList = async (req, res) => {
  try {
    const { id } = req.params;
    const trainees = Array.isArray(req.body?.list_students) ? req.body.list_students : [];
    if (!trainees.length)
      return res.status(400).json({ ok: false, message: "list_students is empty" });

    const lesson = await Lesson.findById(id);
    if (!lesson) return res.status(404).json({ ok: false, message: "לא נמצא" });

    const removeSet = new Set(trainees.map(String));
    const before = (lesson.list_students || []).length;

    lesson.list_students = (lesson.list_students || []).filter(
      (t) => !removeSet.has(String(t))
    );

    const removedCount = before - (lesson.list_students || []).length;
    lesson.updatedAt = new Date();
    await lesson.save();

    await safeNotify({
      toRoles: ["ادارة"],
      module: "LESSONS",
      action: "STUDENTS_REMOVED",
      title: "تحديث قائمة الطلاب",
      message: `تم حذف ${removedCount} طلاب من درس: ${lesson.name}`,
      entity: { kind: "lesson", id: lesson._id },
      meta: { removedCount },
      createdBy: req.user?._id || lesson.teacher || null,
    });

    return res.status(200).json({ ok: true, lesson });
  } catch (err) {
    logWithSource("Lesson.removeFromList", err);
    return res.status(500).json({ ok: false, message: err.message });
  }
};

/* ===================== Copy month + delete month (your code, unchanged) ===================== */
function isInt(n) { return Number.isInteger(Number(n)); }

function sameSlot(a, b) {
  return (
    Number(a?.date?.day) === Number(b?.date?.day) &&
    Number(a?.date?.startMin ?? a?.date?.hh * 60) === Number(b?.date?.startMin ?? b?.date?.hh * 60) &&
    String(a?.teacher || "") === String(b?.teacher || "")
  );
}

const copyMonth = async (req, res) => {
  try {
    const q = { ...req.query, ...(req.body || {}) };

    const now = new Date();
    const fromMonth = isInt(q.fromMonth) ? Number(q.fromMonth) : (now.getMonth() + 1);
    const fromYear = isInt(q.fromYear) ? Number(q.fromYear) : now.getFullYear();

    const d = new Date(fromYear, fromMonth - 1, 1);
    d.setMonth(d.getMonth() + 1);
    const toMonth = isInt(q.toMonth) ? Number(q.toMonth) : (d.getMonth() + 1);
    const toYear = isInt(q.toYear) ? Number(q.toYear) : d.getFullYear();

    const overwrite = q.overwrite === "true" || q.overwrite === true;
    const keepTrainees = q.keepTrainees === "true" || q.keepTrainees === true;
    const teacherOnly = q.teacherOnly ? String(q.teacherOnly) : null;

    const filterFrom = { "date.month": fromMonth, "date.year": fromYear };
    if (teacherOnly) filterFrom.teacher = new mongoose.Types.ObjectId(teacherOnly);

    const sourceLessons = await Lesson.find(filterFrom).lean();
    if (!sourceLessons.length) {
      return res.status(200).json({ ok: true, copied: 0, skipped: 0, message: "אין שיעורים בחודש המקור" });
    }

    const filterTo = { "date.month": toMonth, "date.year": toYear };
    const targetLessons = await Lesson.find(filterTo).lean();

    const ops = [];
    let copied = 0, skipped = 0, removed = 0;

    if (overwrite && targetLessons.length) {
      const idsToDelete = [];
      for (const src of sourceLessons) {
        const match = targetLessons.find((t) => sameSlot(src, t));
        if (match) idsToDelete.push(match._id);
      }
      if (idsToDelete.length) {
        ops.push({ deleteMany: { filter: { _id: { $in: idsToDelete } } } });
        removed += idsToDelete.length;
      }
    }

    for (const src of sourceLessons) {
      const already = targetLessons.find((t) => sameSlot(src, t));
      if (already && !overwrite) { skipped++; continue; }

      const startMin = (src?.date?.startMin ?? (src?.date?.hh * 60)) ?? 8 * 60;
      const endMin = (src?.date?.endMin ?? (startMin + 45));

      ops.push({
        insertOne: {
          document: {
            name: src.name,
            date: { day: src.date.day, startMin, endMin },
            teacher: src.teacher,
            helper: src.helper,
            room: src.room,
            list_students: keepTrainees ? (src.list_students || []) : [],
            createdAt: new Date(),
            updatedAt: null,
          },
        },
      });
      copied++;
    }

    if (!ops.length) {
      return res.status(200).json({ ok: true, copied: 0, skipped, removed, message: "אין מה לעדכן" });
    }

    const result = await Lesson.bulkWrite(ops, { ordered: false });

    await safeNotify({
      toRoles: ["ادارة"],
      module: "LESSONS",
      action: "COPIED_MONTH",
      title: "نسخ دروس شهر",
      message: `تم نسخ ${copied} (تخطّي ${skipped} / حذف ${removed})`,
      entity: { kind: "lessons", id: "copyMonth" },
      meta: { fromMonth, fromYear, toMonth, toYear, copied, skipped, removed },
      createdBy: req.user?._id || null,
    });

    return res.status(200).json({ ok: true, copied, skipped, removed, result });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
};

const deletePerMonth = async (req, res) => {
  try {
    const { month, year } = req.params;

    if (!isInt(month) || !isInt(year)) {
      return res.status(400).json({ ok: false, message: "invalid month/year" });
    }

    const result = await Lesson.deleteMany({ "date.month": Number(month), "date.year": Number(year) });

    await safeNotify({
      toRoles: ["ادارة"],
      module: "LESSONS",
      action: "DELETED_MONTH",
      title: "حذف دروس شهر",
      message: `تم حذف ${result.deletedCount} دروس`,
      entity: { kind: "lessons", id: "deletePerMonth" },
      meta: { month: Number(month), year: Number(year), deletedCount: result.deletedCount },
      createdBy: req.user?._id || null,
    });

    return res.status(200).json({ ok: true, deletedCount: result.deletedCount });
  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
};
const getDow1to7 = (d = new Date()) => {
  const js = d.getDay();
  return js === 0 ? 1 : js + 1;
};

const getLessonsByToDay = async (req, res) => {
  try {
    const dow = getDow1to7(new Date());

    const lessons = await Lesson.find({ "date.day": dow })
      .populate("teacher", "firstname lastname name")
      .select("name date room teacher helper list_students")
      .lean();

    return res.status(200).json({ ok: true, lessons });
  } catch (err) {
    console.error("lessons/today error:", err);
    return res.status(500).json({ ok: false, message: "server error" });
  }
}
module.exports = {
  getAll,
  getOne,
  postOne,
  putOne,
  deleteOne,
  addToList,
  removeFromList,
  copyMonth,
  deletePerMonth,
  getLessonsByQuery,
  getLessonsByToDay,
};
