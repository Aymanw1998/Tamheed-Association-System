const service = require("./Notice.service.js");
const { logWithSource } = require("../../middleware/logger.js");
const { runVehicleExpiryCheck } = require("../../services/vehicleExpiryJob.js");
const { audit } = require("../../utils/audit.js");
const { actorRef, actorDisplayName } = require("../../utils/permissions.js");
const { can } = require("../../utils/permissions.js");
const { recipientsFor } = require("../../services/alertEngine.js");
const { push } = require("../../utils/push.js");

const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";
const SEVERITIES = ["critical", "important", "info"];
const CATEGORIES = ["vehicle", "system", "manual"];
const fail = (res, status, message, extra = {}) => res.status(status).json({ ok: false, message, ...extra });
const rules = require("../../utils/vehicleRules.js");
const MAX_END_DAYS = 365;

// An optional end date (owner, 2026-11-02): today up to a year ahead. The
// notice is gone after that day; expireAt is the end of it in Israel
// (UTC+2, so in summer an hour later), for the TTL index.
function endDateOf(value) {
  const endDate = String(value ?? "").trim();
  if (!endDate) return { endDate: "" };
  const days = rules.isValidDateOnly(endDate) ? rules.daysBetween(rules.todayInJerusalem(), endDate) : NaN;
  if (!(days >= 0 && days <= MAX_END_DAYS)) return { error: "تاريخ الانتهاء يجب أن يكون من اليوم وحتى سنة" };
  const [y, m, d] = endDate.split("-").map(Number);
  return { endDate, expireAt: new Date(Date.UTC(y, m - 1, d + 1) - 2 * 60 * 60 * 1000) };
}

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
  const skip = Number(req.query?.skip || 0);
  if (!Number.isSafeInteger(skip) || skip < 0 || skip > 1000000) return fail(res, 400, "صفحة الإشعارات غير صالحة");
  const notices = await service.listNotices({
    userId: req.actor.id,
    status: ["unread", "archived", "deleted"].includes(status) ? status : "all",
    canManageTrash: req.query?.personal !== "1" && ["notices.delete", "notices.restore", "notices.purge"].some((key) => can(req.actor?.permissions, key)),
    category: CATEGORIES.includes(category) ? category : "",
    severity: SEVERITIES.includes(severity) ? severity : "",
    skip,
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
  const end = endDateOf(req.body?.endDate);
  if (end.error) errors.endDate = end.error;
  if (Object.keys(errors).length) return fail(res, 400, "يرجى تصحيح الحقول", { errors });
  const { notice } = await service.publishNotice({
    title, body, severity, category: "manual", endDate: end.endDate, expireAt: end.expireAt,
    // The system account is stored as "system" / "النظام"; its author has read it.
    createdBy: actorRef(req.actor, req.actor.id), createdByName: actorDisplayName(req.actor),
    readBy: [String(req.actor.id)],
  });
  await audit.record(req, {
    module: "notices", action: "create", targetType: "notice",
    targetId: notice?._id, targetLabel: title, after: notice,
  });
  // Phones of everyone who can read the board, except the author. Never fatal.
  // Not awaited: the response never waits for the push services.
  Promise.resolve()
    .then(async () => {
      const tzs = (await recipientsFor({ permission: "notices.view" })).filter((tz) => tz !== String(req.actor.tz));
      await push.sendToStaff(tzs, { title, body: "", url: "/notices" });
    })
    .catch((err) => logWithSource("Notice.create push", err));
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
  const { archivedAt, archivedBy, ...before } = notice;
  await audit.record(req, {
    module: "notices", action: "update", targetType: "notice",
    targetId: notice._id, targetLabel: notice.title, before, after: notice,
  });
  return res.status(200).json({ ok: true });
});

const runVehicleCheck = handle("runVehicleCheck", async (req, res) => {
  const result = await runVehicleExpiryCheck({ trigger: `manual:${req.actor.id}` });
  if (result?.skipped === "running") return res.status(409).json({ ok: false, message: "فحص المركبات يعمل الآن، حاول بعد قليل" });
  return res.status(200).json({ ok: true, ...result });
});

const stateAction = (action) => handle(action, async (req, res) => {
  const notice = await service.changeNoticeState(req.params.id, req.actor, action);
  if (!notice) return fail(res, 404, "الإعلان غير موجود أو لا يمكن تنفيذ العملية عليه");
  await audit.record(req, { module: "notices", action: "update", targetType: "notice", targetId: notice._id, targetLabel: notice.title, after: { action } });
  return res.json({ ok: true });
});
// Permanent delete from the trash; the audit keeps only that it happened.
const purge = handle("purge", async (req, res) => {
  const notice = await service.purgeNotice(req.params?.id);
  if (!notice) return fail(res, 404, "الإعلان غير موجود في المحذوفات");
  await audit.record(req, { module: "notices", action: "delete", targetType: "notice", targetId: notice._id, targetLabel: notice.title });
  return res.json({ ok: true });
});
module.exports = { list, purge, unreadCount, create, read, readAll, archive, runVehicleCheck,
  trash: stateAction("delete"), restore: stateAction("restore"), hide: stateAction("hide"), unhide: stateAction("unhide") };
