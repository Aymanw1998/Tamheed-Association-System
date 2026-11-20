const { can } = require("../../utils/permissions");

// Excel exports (owner, 2026-11-16): only for managers, and each one is
// written in the audit log. Each kind also needs its own export key, which IT
// can take away without taking away viewing (owner, 2026-11-18). The students and staff files are built in the
// browser from the lists on screen; the browser asks here first (POST /log),
// so no file is made without its row. The month's program summary was
// removed (owner, 2026-11-20).
//   students  students.viewAll and students.exportExcel
//   users     users.view and users.exportExcel
const KINDS = {
  students: { may: (a) => can(a, "students.viewAll") && can(a, "students.exportExcel"), module: "students", label: "تصدير قائمة الطلاب إلى Excel" },
  users: { may: (a) => can(a, "users.view") && can(a, "users.exportExcel"), module: "users", label: "تصدير قائمة الموظفين إلى Excel" },
};
const FORBIDDEN = { ok: false, code: "FORBIDDEN", message: "ليست لديك صلاحية لتنفيذ هذه العملية" };
const SERVER_ERROR = { ok: false, message: "حدث خطأ غير متوقع، حاول مرة أخرى" };
const AUDIT_FAILED = { ok: false, code: "AUDIT_FAILED", message: "تعذر تسجيل التصدير في السجل، لذلك لم يتم. حاول مرة أخرى" };

function createExportController({ audit }) {
  const log = async (req, res) => {
    try {
      // Own keys only: a name like "constructor" is not a kind.
      const key = String(req.body?.kind || "");
      const kind = Object.hasOwn(KINDS, key) ? KINDS[key] : null;
      if (!kind) return res.status(400).json({ ok: false, message: "نوع غير معروف" });
      if (!kind.may(req.actor)) return res.status(403).json(FORBIDDEN);
      const count = Math.max(0, Math.min(Number(req.body.count) || 0, 100000));
      const written = await audit.recordRequired(req, { module: kind.module, action: "export_excel", targetType: "list", targetLabel: `${kind.label} (${count})` });
      if (!written) return res.status(503).json(AUDIT_FAILED);
      return res.json({ ok: true });
    } catch (error) {
      require("../../middleware/logger").logWithSource("Export.log", error);
      return res.status(500).json(SERVER_ERROR);
    }
  };

  return { log };
}

function defaultController() {
  const { audit } = require("../../utils/audit");
  return createExportController({ audit });
}

module.exports = { createExportController, defaultController, KINDS };
