const { can } = require("../../utils/permissions");

// Excel exports (owner, 2026-11-16): only for managers, and each one is
// written in the audit log. Each kind also needs its own export key, which IT
// can take away without taking away viewing (owner, 2026-11-18). The students and staff files are built in the
// browser from the lists on screen; the browser asks here first (POST /log),
// so no file is made without its row. The month's program summary is built
// here and logged here.
//   students  students.viewAll and students.exportExcel
//   users     users.view and users.exportExcel
//   programs  lessons.viewAll, attendance.view and lessons.exportExcel
const KINDS = {
  students: { may: (a) => can(a, "students.viewAll") && can(a, "students.exportExcel"), module: "students", label: "تصدير قائمة الطلاب إلى Excel" },
  users: { may: (a) => can(a, "users.view") && can(a, "users.exportExcel"), module: "users", label: "تصدير قائمة الموظفين إلى Excel" },
  programs: { may: (a) => can(a, "lessons.viewAll") && can(a, "attendance.view") && can(a, "lessons.exportExcel"), module: "lessons", label: "تصدير ملخص البرامج الشهري إلى Excel" },
};
const FORBIDDEN = { ok: false, code: "FORBIDDEN", message: "ليست لديك صلاحية لتنفيذ هذه العملية" };
const SERVER_ERROR = { ok: false, message: "حدث خطأ غير متوقع، حاول مرة أخرى" };
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const PRESENT = "حاضر";
const LATE = "متأخر";
const ABSENT = "غائب";
const AUDIT_FAILED = { ok: false, code: "AUDIT_FAILED", message: "تعذر تسجيل التصدير في السجل، لذلك لم يتم. حاول مرة أخرى" };
const name = (p) => `${p?.firstname || ""} ${p?.lastname || ""}`.trim();

// One row per lesson: its time, guide, students now, the days with
// attendance in the month and the marks counted (late counts as present).
function programsSummary(lessons, marks, users) {
  const names = new Map((users || []).map((u) => [String(u._id), name(u)]));
  const byLesson = new Map();
  for (const m of marks || []) {
    const key = String(m.lesson);
    const entry = byLesson.get(key) || { days: new Set(), present: 0, late: 0, absent: 0 };
    entry.days.add(Number(m.dateKey));
    if (m.status === PRESENT) entry.present += 1;
    else if (m.status === LATE) entry.late += 1;
    else if (m.status === ABSENT) entry.absent += 1;
    byLesson.set(key, entry);
  }
  return (lessons || [])
    .map((l) => {
      const e = byLesson.get(String(l._id)) || { days: new Set(), present: 0, late: 0, absent: 0 };
      const marked = e.present + e.late + e.absent;
      return {
        name: l.name || "", day: Number(l?.date?.day) || 0, startMin: Number(l?.date?.startMin) || 0, endMin: Number(l?.date?.endMin) || 0,
        room: l.room ?? "", teacher: names.get(String(l.teacher || "")) || "",
        students: Array.isArray(l.list_students) ? l.list_students.length : 0,
        days: e.days.size, present: e.present, late: e.late, absent: e.absent,
        rate: marked ? Math.round(((e.present + e.late) / marked) * 100) : null,
      };
    })
    .sort((a, b) => a.day - b.day || a.startMin - b.startMin || a.name.localeCompare(b.name, "ar"));
}

function createExportController({ audit, listLessons, marksBetween, listUsers }) {
  const log = async (req, res) => {
    try {
      // Own keys only: a name like "constructor" is not a kind.
      const key = String(req.body?.kind || "");
      const kind = key !== "programs" && Object.hasOwn(KINDS, key) ? KINDS[key] : null;
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

  const programs = async (req, res) => {
    if (!KINDS.programs.may(req.actor)) return res.status(403).json(FORBIDDEN);
    const m = MONTH.exec(String(req.query.month || ""));
    if (!m) return res.status(400).json({ ok: false, message: "الشهر غير صحيح" });
    try {
      const year = Number(m[1]);
      const month = Number(m[2]);
      const from = year * 10000 + month * 100 + 1;
      const to = year * 10000 + month * 100 + 31;
      const [lessons, marks, users] = await Promise.all([listLessons(), marksBetween(from, to), listUsers()]);
      const rows = programsSummary(lessons, marks, users);
      const written = await audit.recordRequired(req, { module: "lessons", action: "export_excel", targetType: "list", targetLabel: `${KINDS.programs.label} ${m[0]} (${rows.length})` });
      if (!written) return res.status(503).json(AUDIT_FAILED);
      return res.json({ ok: true, month: m[0], rows });
    } catch (error) {
      require("../../middleware/logger").logWithSource("Export.programs", error);
      return res.status(500).json(SERVER_ERROR);
    }
  };
  return { log, programs };
}

function defaultController() {
  const { audit } = require("../../utils/audit");
  const { LessonModelDef } = require("../Lesson/Lesson.model");
  const { AttendanceModelDef } = require("../Attendance/Attendance.model");
  const { UserModelDef } = require("../User/User.model");
  return createExportController({
    audit,
    listLessons: async () => (await LessonModelDef.get({}))?.result || [],
    marksBetween: async (from, to) => (await AttendanceModelDef.get({ dateKey: { $gte: from, $lte: to } }))?.result || [],
    listUsers: async () => [
      ...((await UserModelDef.get({}, "active"))?.result || []),
      ...((await UserModelDef.get({}, "noActive"))?.result || []),
    ],
  });
}

module.exports = { createExportController, programsSummary, defaultController, KINDS };
