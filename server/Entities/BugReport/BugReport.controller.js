// «الإبلاغ عن مشكلة» (owner, 2026-11-04). One press sends the error of the last
// two minutes; with none, the window sends a fault, a suggestion or a tangible
// problem, with text and a picture. Every IT mailbox gets an email without the
// picture. Marking a report as done deletes it and its picture for good.
const { WINDOW_MS, recentErrors } = require("../../utils/recentErrors");
const { cleanText, imageTypeOf } = require("../../utils/reportRedact");
const { actorDisplayName, hasRealEmail, isItUser } = require("../../utils/permissions");
const { logWithSource } = require("../../middleware/logger");

const TYPES = ["fault", "suggestion", "problem"];
const CLIENT_KINDS = ["network", "crash"];
const NO_RECENT = { ok: false, code: "NO_RECENT_ERROR" };
const SERVER_ERROR = { ok: false, message: "حدث خطأ غير متوقع، حاول مرة أخرى" };
const rows = (found) => (Array.isArray(found?.result) ? found.result : []);

function createBugReports(deps = {}) {
  const {
    errors = recentErrors,
    now = () => Date.now(),
    systemEmail = () => process.env.SYSTEM_ADMIN_EMAIL,
  } = deps;
  const models = () => require("./BugReport.model");
  const reports = () => deps.reports || models().BugReportModel;
  const images = () => deps.images || models().BugReportImageModel;
  const users = () => deps.users || require("../User/User.model").UserModelDef;
  const audit = () => deps.audit || require("../../utils/audit").audit;
  const sendMail = (to, report) => (deps.sendMail || require("../../utils/sendEmail").sendBugReportEmail)(to, report);

  // Every IT user who is not blocked and has a real mailbox, and the system account's.
  const itMailboxes = async () => {
    const found = rows(await users().get({}, "active"))
      .filter((user) => isItUser(user) && !user.itBlockedAt && hasRealEmail(user))
      .map((user) => String(user.email).trim());
    const system = String(systemEmail() || "").trim();
    return [...new Set([...found, ...(system.includes("@") ? [system] : [])])];
  };

  // Never fatal, and the answer does not wait for it: the report is already stored.
  const tellIt = (report) => {
    Promise.resolve()
      .then(async () => {
        const results = await Promise.allSettled((await itMailboxes()).map((to) => sendMail(to, report)));
        for (const result of results) {
          if (result.status === "rejected") logWithSource("BugReport.mail", result.reason);
        }
      })
      .catch((err) => logWithSource("BugReport.mail", err));
  };

  const baseOf = (req) => ({
    reporterName: cleanText(actorDisplayName(req.actor), 80),
    reporterRole: cleanText(req.actor?.role || "", 30),
    section: cleanText(req.body?.section, 60),
    page: cleanText(String(req.body?.page ?? "").split("?")[0], 200),
    device: cleanText(req.headers?.["user-agent"], 200),
    createdAt: new Date(now()),
  });

  // What one press sends, or null when there is no error to send.
  const autoReport = (req) => {
    const body = req.body || {};
    if (body.requestId) {
      const entry = errors.find(body.requestId);
      if (!entry) return null;
      if (entry.actorId && entry.actorId !== String(req.actor?.id)) return null;
      errors.take(body.requestId);
      return {
        errorKind: "server",
        action: `${entry.method} ${entry.path}`,
        errorStatus: entry.status,
        errorCode: entry.code,
        // Handlers that never log still answered something the user saw.
        errorMessage: entry.message || cleanText(body.message, 500),
        errorSource: entry.source,
        requestId: String(body.requestId).slice(0, 40),
      };
    }
    const age = Number(body.ageMs);
    if (!CLIENT_KINDS.includes(body.kind) || !(age >= 0 && age <= WINDOW_MS)) return null;
    return {
      errorKind: body.kind,
      action: cleanText(body.action, 200),
      errorStatus: 0,
      errorCode: "",
      errorMessage: cleanText(body.message, 500),
      errorSource: "",
      requestId: "",
    };
  };

  const create = async (req, res) => {
    try {
      const auto = req.body?.mode === "auto";
      let fields;
      let image = null;
      if (auto) {
        const error = autoReport(req);
        if (!error) return res.status(409).json(NO_RECENT);
        fields = { type: "fault", source: "auto", text: "", hasImage: false, ...error };
      } else {
        const text = cleanText(req.body?.text, 2000);
        if (!TYPES.includes(req.body?.type) || !text) {
          return res.status(400).json({ ok: false, code: "BAD_REPORT", message: "اكتب وصف المشكلة واختر نوعها" });
        }
        if (req.file) {
          const contentType = imageTypeOf(req.file.buffer);
          if (!contentType) return res.status(400).json({ ok: false, code: "BAD_IMAGE", message: "يمكن إرفاق صورة فقط" });
          image = { buffer: req.file.buffer, contentType };
        }
        fields = {
          type: req.body.type, source: "manual", text, hasImage: Boolean(image),
          errorKind: "", action: "", errorStatus: 0, errorCode: "", errorMessage: "", errorSource: "", requestId: "",
        };
      }
      const created = await reports().create({ ...baseOf(req), ...fields });
      const report = created?.result;
      if (image) {
        try {
          await images().create({ reportId: String(report._id), image: image.buffer, contentType: image.contentType, createdAt: new Date(now()) });
        } catch (err) {
          await reports().remove({ _id: report._id });
          throw err;
        }
      }
      tellIt(report);
      return res.status(201).json({ ok: true });
    } catch (err) {
      logWithSource("BugReport.create", err);
      return res.status(500).json(SERVER_ERROR);
    }
  };

  const list = async (req, res) => {
    try {
      const found = rows(await reports().get({}));
      found.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return res.status(200).json({ ok: true, reports: found });
    } catch (err) {
      logWithSource("BugReport.list", err);
      return res.status(500).json(SERVER_ERROR);
    }
  };

  const image = async (req, res) => {
    try {
      const found = rows(await images().get({ reportId: String(req.params?.id ?? "") }))[0];
      if (!found) return res.status(404).json({ ok: false, code: "NOT_FOUND" });
      res.set("Content-Type", found.contentType);
      res.set("X-Content-Type-Options", "nosniff");
      res.set("Cache-Control", "private, no-store");
      const bytes = found.image?.buffer && !Buffer.isBuffer(found.image) ? found.image.buffer : found.image;
      return res.status(200).send(Buffer.from(bytes));
    } catch (err) {
      logWithSource("BugReport.image", err);
      return res.status(500).json(SERVER_ERROR);
    }
  };

  // «تم الحل» and «حذف» are this one action: gone for good. The audit row says
  // only that a report was deleted, so its text does not stay behind.
  const remove = async (req, res) => {
    try {
      const id = String(req.params?.id ?? "");
      // A malformed id finds nothing, like an unknown one.
      const found = rows(await reports().get({ _id: id }).catch((err) => {
        if (err?.name === "CastError") return null;
        throw err;
      }))[0];
      if (!found) return res.status(404).json({ ok: false, code: "NOT_FOUND", message: "البلاغ غير موجود" });
      await images().remove({ reportId: id });
      await reports().remove({ _id: found._id });
      await audit().record(req, { module: "it", action: "delete", targetType: "bugReport", targetId: id, targetLabel: found.type });
      return res.status(200).json({ ok: true });
    } catch (err) {
      logWithSource("BugReport.remove", err);
      return res.status(500).json(SERVER_ERROR);
    }
  };

  return { create, list, image, remove };
}

module.exports = { createBugReports, bugReports: createBugReports() };
