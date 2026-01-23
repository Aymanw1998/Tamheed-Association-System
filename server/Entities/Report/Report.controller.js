const mongoose = require("mongoose");
const Report = require("./Report.model.js");
const { logWithSource } = require("../../middleware/logger.js");

// ✅ optional: notifications service (إذا موجود)
let notify = null;
try {
  ({ notify } = require("../Notification/Notification.controller")); // عدّل المسار حسب مشروعك
} catch (e) {
  notify = null;
}
const safeNotify = async (payload) => {
  try {
    if (typeof notify === "function") await notify(payload);
  } catch (e) {
    logWithSource("Report.safeNotify", e);
  }
};

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/* ===================== GET ALL ===================== */
// GET /api/reports?type=
const getAll = async (req, res) => {
  try {
    const { type } = req.query;

    const filter = {};
    if (type) filter.type = type;

    const reports = await Report.find(filter).sort({ createdAt: -1 }).lean();
    
    return res.status(200).json({ ok: true, reports });
  } catch (error) {
    logWithSource("Report.getAll", error);
    return res.status(500).json({ ok: false, message: "Internal server error" });
  }
};

/* ===================== GET BY ID ===================== */
// GET /api/reports/:id
const getById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid id" });
    }

    const report = await Report.findById(id).lean();
    if (!report) return res.status(404).json({ ok: false, message: "Not found" });

    return res.status(200).json({ ok: true, report });
  } catch (error) {
    logWithSource("Report.getById", error);
    return res.status(500).json({ ok: false, message: "Internal server error" });
  }
};

/* ===================== CREATE ===================== */
// POST /api/reports
const post = async (req, res) => {
  try {
    const { date, attendance, title, stitle, info, createdBy, type } = req.body;

    // ✅ fix validation
    if (!info || String(info).trim() === "") {
      return res.status(400).json({ ok: false, message: "يجب ان يكون صلب موضوع" });
    }

    const doc = await Report.create({
      date: date || new Date(),
      attendance: Array.isArray(attendance) ? attendance : [],
      title: Array.isArray(title) ? title : [],
      stitle: stitle || "",
      info: String(info),
      type: type || undefined,
      createdBy: createdBy || req.user?._id || null,
    });

    // ✅ notify admins
    await safeNotify({
      toRoles: ["ادارة"],
      module: "REPORTS",
      action: "CREATED",
      title: "تم إضافة تقرير جديد",
      message: `تم إنشاء تقرير: ${doc.stitle || (doc.title || []).join(", ") || "بدون عنوان"}`,
      entity: { kind: "report", id: doc._id },
      meta: {
        date: doc.date,
        title: doc.title,
        attendanceCount: (doc.attendance || []).length,
      },
      createdBy: req.user?._id || doc.createdBy || null,
    });

    return res.status(201).json({ ok: true, report: doc });
  } catch (error) {
    logWithSource("Report.post", error);
    return res.status(500).json({ ok: false, message: "Internal server error" });
  }
};

/* ===================== UPDATE ===================== */
// PUT /api/reports/:id
const put = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, attendance, title, stitle, info, type } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid id" });
    }

    // ✅ optional: if info موجود لازم يكون مش فاضي
    if (info !== undefined && String(info).trim() === "") {
      return res.status(400).json({ ok: false, message: "يجب ان يكون صلب موضوع" });
    }

    const updateObj = {};
    if (date !== undefined) updateObj.date = date;
    if (attendance !== undefined) updateObj.attendance = Array.isArray(attendance) ? attendance : [];
    if (title !== undefined) updateObj.title = Array.isArray(title) ? title : [];
    if (stitle !== undefined) updateObj.stitle = stitle || "";
    if (info !== undefined) updateObj.info = String(info);
    if (type !== undefined) updateObj.type = type;

    const report = await Report.findByIdAndUpdate(id, updateObj, {
      new: true,
      runValidators: true,
    });

    if (!report) return res.status(404).json({ ok: false, message: "Not found" });

    // ✅ notify admins
    await safeNotify({
      toRoles: ["ادارة"],
      module: "REPORTS",
      action: "UPDATED",
      title: "تم تعديل تقرير",
      message: `تم تعديل تقرير: ${report.stitle || (report.title || []).join(", ") || "بدون عنوان"}`,
      entity: { kind: "report", id: report._id },
      meta: {
        date: report.date,
        title: report.title,
        attendanceCount: (report.attendance || []).length,
      },
      createdBy: req.user?._id || report.createdBy || null,
    });

    return res.status(200).json({ ok: true, report });
  } catch (error) {
    logWithSource("Report.put", error);
    return res.status(500).json({ ok: false, message: "Internal server error" });
  }
};

/* ===================== DELETE ===================== */
// DELETE /api/reports/:id
const remove = async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ ok: false, message: "Invalid id" });
    }

    const report = await Report.findByIdAndDelete(id);
    if (!report) return res.status(404).json({ ok: false, message: "Not found" });

    // ✅ notify admins
    await safeNotify({
      toRoles: ["ادارة"],
      module: "REPORTS",
      action: "DELETED",
      title: "تم حذف تقرير",
      message: `تم حذف تقرير: ${report.stitle || (report.title || []).join(", ") || "بدون عنوان"}`,
      entity: { kind: "report", id: report._id },
      meta: {
        date: report.date,
        title: report.title,
      },
      createdBy: req.user?._id || report.createdBy || null,
    });

    return res.status(200).json({ ok: true, removed: true });
  } catch (error) {
    logWithSource("Report.remove", error);
    return res.status(500).json({ ok: false, message: "Internal server error" });
  }
};

module.exports = {
  getAll,
  getById,
  post,
  put,
  remove,
};
