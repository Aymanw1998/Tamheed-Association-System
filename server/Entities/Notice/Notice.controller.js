const service = require("./Notice.service.js");
const { logWithSource } = require("../../middleware/logger.js");
const { runVehicleExpiryCheck } = require("../../services/vehicleExpiryJob.js");

const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";
const SEVERITIES = ["critical", "important", "info"];
const CATEGORIES = ["vehicle", "system", "manual"];
const fail = (res, status, message, extra = {}) => res.status(status).json({ ok: false, message, ...extra });

// Access is checked in Notice.route.js; req.actor comes from loadActor.

const handle = (name, fn) => async (req, res) => {
  try {
    return await fn(req, res);
  } catch (err) {
    logWithSource(`Notice.${name}`, err);
    return fail(res, 500, SERVER_ERROR);
  }
};

const list = handle("list", async (req, res) => {
  const { status = "all", category = "", severity = "" } = req.query || {};
  const notices = await service.listNotices({
    userId: req.actor.id,
    status: status === "unread" ? "unread" : "all",
    category: CATEGORIES.includes(category) ? category : "",
    severity: SEVERITIES.includes(severity) ? severity : "",
  });
  return res.status(200).json({ ok: true, notices });
});

const unreadCount = handle("unreadCount", async (req, res) =>
  res.status(200).json({ ok: true, count: await service.countUnread(req.actor.id) })
);

const create = handle("create", async (req, res) => {
  const title = String(req.body?.title ?? "").trim();
  const body = String(req.body?.body ?? "").trim();
  const severity = String(req.body?.severity ?? "info");
  const errors = {};
  if (!title || title.length > 120) errors.title = "العنوان مطلوب (حتى 120 حرفًا)";
  if (body.length > 2000) errors.body = "النص طويل جدًا (حتى 2000 حرف)";
  if (!SEVERITIES.includes(severity)) errors.severity = "درجة الأهمية غير صحيحة";
  if (Object.keys(errors).length) return fail(res, 400, "يرجى تصحيح الحقول", { errors });
  const { notice } = await service.publishNotice({
    title, body, severity, category: "manual", createdBy: req.actor.id, createdByName: req.actor.name,
  });
  return res.status(201).json({ ok: true, notice });
});

const read = handle("read", async (req, res) => {
  const notice = await service.markRead(req.params?.id, req.actor.id);
  if (!notice) return fail(res, 404, "الإعلان غير موجود");
  return res.status(200).json({ ok: true });
});

const readAll = handle("readAll", async (req, res) =>
  res.status(200).json({ ok: true, updated: await service.markAllRead(req.actor.id) })
);

const archive = handle("archive", async (req, res) => {
  const notice = await service.archiveNotice(req.params?.id, req.actor);
  if (!notice) return fail(res, 404, "الإعلان غير موجود");
  return res.status(200).json({ ok: true });
});

const runVehicleCheck = handle("runVehicleCheck", async (req, res) => {
  const result = await runVehicleExpiryCheck({ trigger: `manual:${req.actor.id}` });
  if (result?.skipped === "running") return res.status(409).json({ ok: false, message: "فحص المركبات يعمل الآن، حاول بعد قليل" });
  return res.status(200).json({ ok: true, ...result });
});

module.exports = { list, unreadCount, create, read, readAll, archive, runVehicleCheck };
