const { ReportModelDef } = require("./Report.model.js");
const { logWithSource } = require("../../middleware/logger.js");

/* ===================== optional notifications ===================== */
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
    logWithSource("Report.safeNotify", e);
  }
};

/* ===================== helpers ===================== */
function toDate(value) {
  if (!value) return new Date();
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

  return new Date();
}

function sanitize(report) {
  if (!report) return report;
  return { ...report };
}

function pickId(doc) {
  return doc?._id || doc?.id || null;
}

async function getReportById(id) {
  const result = await ReportModelDef.get({ _id: id });
  if (result?.success && Array.isArray(result.result) && result.result.length > 0) {
    return result.result[0];
  }
  return null;
}

/* ===================== GET ALL ===================== */
// GET /api/reports?type=
const getAll = async (req, res) => {
  try {
    const { type } = req.query;

    const filter = {};
    if (type) filter.type = type;

    const result = await ReportModelDef.get(filter);
    const reports = Array.isArray(result?.result) ? result.result : [];

    reports.sort((a, b) => {
      const ad = new Date(a.createdAt || a.date || 0).getTime();
      const bd = new Date(b.createdAt || b.date || 0).getTime();
      return bd - ad;
    });

    return res.status(200).json({
      ok: true,
      reports: reports.map(sanitize),
    });
  } catch (error) {
    logWithSource("Report.getAll", error);
    return res.status(500).json({
      ok: false,
      message: "Internal server error",
    });
  }
};

/* ===================== GET BY ID ===================== */
// GET /api/reports/:id
const getById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || String(id).trim() === "") {
      return res.status(400).json({
        ok: false,
        message: "Invalid id",
      });
    }

    const report = await getReportById(String(id).trim());

    if (!report) {
      return res.status(404).json({
        ok: false,
        message: "Not found",
      });
    }

    return res.status(200).json({
      ok: true,
      report: sanitize(report),
    });
  } catch (error) {
    logWithSource("Report.getById", error);
    return res.status(500).json({
      ok: false,
      message: "Internal server error",
    });
  }
};

/* ===================== CREATE ===================== */
// POST /api/reports
const post = async (req, res) => {
  try {
    const { date, attendance, title, stitle, info, createdBy, type } = req.body;

    if (!info || String(info).trim() === "") {
      return res.status(400).json({
        ok: false,
        message: "يجب ان يكون صلب موضوع",
      });
    }

    const payload = {
      date: toDate(date),
      attendance: Array.isArray(attendance) ? attendance : [],
      title: Array.isArray(title) ? title : [],
      stitle: stitle || "",
      info: String(info),
      type: type || undefined,
      createdBy: createdBy || req.user?._id || req.user?.tz || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const created = await ReportModelDef.create(payload);

    await safeNotify({
      toRoles: ["ادارة"],
      module: "REPORTS",
      action: "CREATED",
      title: "تم إضافة تقرير جديد",
      message: `تم إنشاء تقرير: ${payload.stitle || payload.title.join(", ") || "بدون عنوان"}`,
      entity: { kind: "report", id: created?.insertedId || null },
      meta: {
        date: payload.date,
        title: payload.title,
        attendanceCount: payload.attendance.length,
      },
      createdBy: req.user?._id || payload.createdBy || null,
    });

    return res.status(201).json({
      ok: true,
      report: created,
    });
  } catch (error) {
    logWithSource("Report.post", error);
    return res.status(500).json({
      ok: false,
      message: "Internal server error",
    });
  }
};

/* ===================== UPDATE ===================== */
// PUT /api/reports/:id
const put = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, attendance, title, stitle, info, type } = req.body;

    if (!id || String(id).trim() === "") {
      return res.status(400).json({
        ok: false,
        message: "Invalid id",
      });
    }

    if (info !== undefined && String(info).trim() === "") {
      return res.status(400).json({
        ok: false,
        message: "يجب ان يكون صلب موضوع",
      });
    }

    const existing = await getReportById(String(id).trim());
    if (!existing) {
      return res.status(404).json({
        ok: false,
        message: "Not found",
      });
    }

    const updateObj = {};
    if (date !== undefined) updateObj.date = toDate(date);
    if (attendance !== undefined) updateObj.attendance = Array.isArray(attendance) ? attendance : [];
    if (title !== undefined) updateObj.title = Array.isArray(title) ? title : [];
    if (stitle !== undefined) updateObj.stitle = stitle || "";
    if (info !== undefined) updateObj.info = String(info);
    if (type !== undefined) updateObj.type = type;

    const updated = await ReportModelDef.update(
      { _id: String(id).trim() },
      updateObj
    );

    const reportAfter = await getReportById(String(id).trim());

    await safeNotify({
      toRoles: ["ادارة"],
      module: "REPORTS",
      action: "UPDATED",
      title: "تم تعديل تقرير",
      message: `تم تعديل تقرير: ${reportAfter?.stitle || (reportAfter?.title || []).join(", ") || "بدون عنوان"}`,
      entity: { kind: "report", id: pickId(reportAfter) || String(id).trim() },
      meta: {
        date: reportAfter?.date || existing.date,
        title: reportAfter?.title || existing.title,
        attendanceCount: (reportAfter?.attendance || existing.attendance || []).length,
      },
      createdBy: req.user?._id || reportAfter?.createdBy || existing.createdBy || null,
    });

    return res.status(200).json({
      ok: true,
      report: reportAfter || updated,
    });
  } catch (error) {
    logWithSource("Report.put", error);
    return res.status(500).json({
      ok: false,
      message: "Internal server error",
    });
  }
};

/* ===================== DELETE ===================== */
// DELETE /api/reports/:id
const remove = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || String(id).trim() === "") {
      return res.status(400).json({
        ok: false,
        message: "Invalid id",
      });
    }

    const existing = await getReportById(String(id).trim());
    if (!existing) {
      return res.status(404).json({
        ok: false,
        message: "Not found",
      });
    }

    await ReportModelDef.delete({ _id: String(id).trim() });

    await safeNotify({
      toRoles: ["ادارة"],
      module: "REPORTS",
      action: "DELETED",
      title: "تم حذف تقرير",
      message: `تم حذف تقرير: ${existing.stitle || (existing.title || []).join(", ") || "بدون عنوان"}`,
      entity: { kind: "report", id: pickId(existing) || String(id).trim() },
      meta: {
        date: existing.date,
        title: existing.title,
      },
      createdBy: req.user?._id || existing.createdBy || null,
    });

    return res.status(200).json({
      ok: true,
      removed: true,
    });
  } catch (error) {
    logWithSource("Report.remove", error);
    return res.status(500).json({
      ok: false,
      message: "Internal server error",
    });
  }
};

module.exports = {
  getAll,
  getById,
  post,
  put,
  remove,
};
// OLD CODE - DO NOT SUGGEST CHANGES TO THIS FILE UNLESS YOU KNOW WHAT YOU ARE DOING
// const mongoose = require("mongoose");
// const Report = require("./Report.model.js");
// const { logWithSource } = require("../../middleware/logger.js");

// // ✅ optional: notifications service (إذا موجود)
// let notify = null;
// try {
//   ({ notify } = require("../Notification/Notification.controller")); // عدّل المسار حسب مشروعك
// } catch (e) {
//   notify = null;
// }
// const safeNotify = async (payload) => {
//   try {
//     if (typeof notify === "function") await notify(payload);
//   } catch (e) {
//     logWithSource("Report.safeNotify", e);
//   }
// };

// const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// /* ===================== GET ALL ===================== */
// // GET /api/reports?type=
// const getAll = async (req, res) => {
//   try {
//     const { type } = req.query;

//     const filter = {};
//     if (type) filter.type = type;

//     const reports = await Report.find(filter).sort({ createdAt: -1 }).lean();
    
//     return res.status(200).json({ ok: true, reports });
//   } catch (error) {
//     logWithSource("Report.getAll", error);
//     return res.status(500).json({ ok: false, message: "Internal server error" });
//   }
// };

// /* ===================== GET BY ID ===================== */
// // GET /api/reports/:id
// const getById = async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!isValidId(id)) {
//       return res.status(400).json({ ok: false, message: "Invalid id" });
//     }

//     const report = await Report.findById(id).lean();
//     if (!report) return res.status(404).json({ ok: false, message: "Not found" });

//     return res.status(200).json({ ok: true, report });
//   } catch (error) {
//     logWithSource("Report.getById", error);
//     return res.status(500).json({ ok: false, message: "Internal server error" });
//   }
// };

// /* ===================== CREATE ===================== */
// // POST /api/reports
// const post = async (req, res) => {
//   try {
//     const { date, attendance, title, stitle, info, createdBy, type } = req.body;

//     // ✅ fix validation
//     if (!info || String(info).trim() === "") {
//       return res.status(400).json({ ok: false, message: "يجب ان يكون صلب موضوع" });
//     }

//     const doc = await Report.create({
//       date: date || new Date(),
//       attendance: Array.isArray(attendance) ? attendance : [],
//       title: Array.isArray(title) ? title : [],
//       stitle: stitle || "",
//       info: String(info),
//       type: type || undefined,
//       createdBy: createdBy || req.user?._id || null,
//     });

//     // ✅ notify admins
//     await safeNotify({
//       toRoles: ["ادارة"],
//       module: "REPORTS",
//       action: "CREATED",
//       title: "تم إضافة تقرير جديد",
//       message: `تم إنشاء تقرير: ${doc.stitle || (doc.title || []).join(", ") || "بدون عنوان"}`,
//       entity: { kind: "report", id: doc._id },
//       meta: {
//         date: doc.date,
//         title: doc.title,
//         attendanceCount: (doc.attendance || []).length,
//       },
//       createdBy: req.user?._id || doc.createdBy || null,
//     });

//     return res.status(201).json({ ok: true, report: doc });
//   } catch (error) {
//     logWithSource("Report.post", error);
//     return res.status(500).json({ ok: false, message: "Internal server error" });
//   }
// };

// /* ===================== UPDATE ===================== */
// // PUT /api/reports/:id
// const put = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { date, attendance, title, stitle, info, type } = req.body;

//     if (!isValidId(id)) {
//       return res.status(400).json({ ok: false, message: "Invalid id" });
//     }

//     // ✅ optional: if info موجود لازم يكون مش فاضي
//     if (info !== undefined && String(info).trim() === "") {
//       return res.status(400).json({ ok: false, message: "يجب ان يكون صلب موضوع" });
//     }

//     const updateObj = {};
//     if (date !== undefined) updateObj.date = date;
//     if (attendance !== undefined) updateObj.attendance = Array.isArray(attendance) ? attendance : [];
//     if (title !== undefined) updateObj.title = Array.isArray(title) ? title : [];
//     if (stitle !== undefined) updateObj.stitle = stitle || "";
//     if (info !== undefined) updateObj.info = String(info);
//     if (type !== undefined) updateObj.type = type;

//     const report = await Report.findByIdAndUpdate(id, updateObj, {
//       new: true,
//       runValidators: true,
//     });

//     if (!report) return res.status(404).json({ ok: false, message: "Not found" });

//     // ✅ notify admins
//     await safeNotify({
//       toRoles: ["ادارة"],
//       module: "REPORTS",
//       action: "UPDATED",
//       title: "تم تعديل تقرير",
//       message: `تم تعديل تقرير: ${report.stitle || (report.title || []).join(", ") || "بدون عنوان"}`,
//       entity: { kind: "report", id: report._id },
//       meta: {
//         date: report.date,
//         title: report.title,
//         attendanceCount: (report.attendance || []).length,
//       },
//       createdBy: req.user?._id || report.createdBy || null,
//     });

//     return res.status(200).json({ ok: true, report });
//   } catch (error) {
//     logWithSource("Report.put", error);
//     return res.status(500).json({ ok: false, message: "Internal server error" });
//   }
// };

// /* ===================== DELETE ===================== */
// // DELETE /api/reports/:id
// const remove = async (req, res) => {
//   try {
//     const { id } = req.params;

//     if (!isValidId(id)) {
//       return res.status(400).json({ ok: false, message: "Invalid id" });
//     }

//     const report = await Report.findByIdAndDelete(id);
//     if (!report) return res.status(404).json({ ok: false, message: "Not found" });

//     // ✅ notify admins
//     await safeNotify({
//       toRoles: ["ادارة"],
//       module: "REPORTS",
//       action: "DELETED",
//       title: "تم حذف تقرير",
//       message: `تم حذف تقرير: ${report.stitle || (report.title || []).join(", ") || "بدون عنوان"}`,
//       entity: { kind: "report", id: report._id },
//       meta: {
//         date: report.date,
//         title: report.title,
//       },
//       createdBy: req.user?._id || report.createdBy || null,
//     });

//     return res.status(200).json({ ok: true, removed: true });
//   } catch (error) {
//     logWithSource("Report.remove", error);
//     return res.status(500).json({ ok: false, message: "Internal server error" });
//   }
// };

// module.exports = {
//   getAll,
//   getById,
//   post,
//   put,
//   remove,
// };
