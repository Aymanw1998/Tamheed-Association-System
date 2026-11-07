const { can, isHiddenUser, SYSTEM_ACTOR_NAME } = require("../../utils/permissions");
const { createReportPdfQueue } = require("../../services/reportPdfQueue");
const { renderReportPdf } = require("../../services/renderReportPdf");
const queue = createReportPdfQueue({ render: renderReportPdf });
const ID = /^[a-f\d]{24}$/i;
function createReportPdfController({ reports, getAuthor = async () => "", jobs = queue }) {
  const denied = (status) => Object.assign(new Error("denied"), { status });
  const owner = (req) => String(req.actor?.id || req.actor?.tz || "");
  const load = async (req, id) => {
    if (!owner(req) || !can(req.actor?.permissions, "reports.exportPdf")) throw denied(403);
    if (!ID.test(String(id))) throw denied(404);
    const found = await reports.get({ _id: String(id) });
    const report = found?.result?.[0];
    if (!report) throw denied(404);
    const author = String(report.createdBy || "");
    if (!can(req.actor.permissions, "reports.viewAll") && (!author || ![req.user?.id, req.user?.tz].some((id) => id != null && author === String(id)))) throw denied(403);
    return report;
  };
  const wrap = (handler) => async (req, res) => {
    try { return await handler(req, res); }
    catch (error) { const status = error.status || 500; return res.status(status).json({ ok: false, code: status === 429 ? "PDF_BUSY" : status === 403 ? "FORBIDDEN" : status === 404 ? "NOT_FOUND" : "PDF_FAILED", message: status === 429 ? "توجد ملفات قيد التجهيز. حاول بعد قليل." : status === 403 ? "لا توجد صلاحية" : status === 404 ? "الملف غير موجود أو انتهت صلاحيته" : "تعذّر تجهيز ملف التقرير" }); }
  };
  const resolve = async (req) => {
    const job = jobs.status(req.params.job, owner(req));
    if (!job || job.reportId !== String(req.params.id)) throw denied(404);
    await load(req, job.reportId); // Recheck current permission, owner and existence.
    return job;
  };
  return {
    start: wrap(async (req, res) => {
      const report = await load(req, req.params.id);
      const payload = { stitle: report.stitle, title: report.title, date: report.date, info: report.info, authorName: await getAuthor(report, req) };
      if (Buffer.byteLength(String(payload.info || ""), "utf8") > 2 * 1024 * 1024) return res.status(413).json({ ok: false, message: "التقرير أكبر من الحد المسموح للتصدير." });
      const job = jobs.start(owner(req), req.params.id, payload);
      res.set("Cache-Control", "no-store"); return res.status(202).json({ ok: true, job });
    }),
    status: wrap(async (req, res) => { const job = await resolve(req); res.set("Cache-Control", "no-store"); return res.json({ ok: true, job }); }),
    download: wrap(async (req, res) => {
      await resolve(req); const buffer = jobs.file(req.params.job, owner(req));
      if (!buffer) return res.status(409).json({ ok: false, message: "الملف ليس جاهزًا بعد" });
      res.set({ "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="tamheed-report.pdf"', "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }); return res.send(buffer);
    }),
    cancel: wrap(async (req, res) => { await resolve(req); jobs.cancel(req.params.job, owner(req)); return res.json({ ok: true }); }),
  };
}
let shared;
const actual = () => shared ||= createReportPdfController({
  reports: require("./Report.model").ReportModelDef,
  getAuthor: async (report, req) => {
    const key = String(report.createdBy || "");
    if (key === "system") return SYSTEM_ACTOR_NAME;
    if ([req.actor?.id, req.actor?.tz].includes(key)) return req.actor.isSystem ? SYSTEM_ACTOR_NAME : req.actor.name;
    const result = await require("../User/User.model").UserModelDef.get(ID.test(key) ? { _id: key } : { tz: key }, "active");
    const user = result?.result?.[0]; return user ? isHiddenUser(user) ? SYSTEM_ACTOR_NAME : [user.firstname, user.lastname].filter(Boolean).join(" ") : "";
  },
});
module.exports = { createReportPdfController, reportPdf: Object.fromEntries(["start", "status", "download", "cancel"].map((name) => [name, (req, res) => actual()[name](req, res)])) };
