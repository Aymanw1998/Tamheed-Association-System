const express = require("express");
const { requirePermission } = require("../../middleware/permissionMiddleware");
const { logWithSource } = require("../../middleware/logger");

const PAGE_SIZE = 50;
const MAX_PAGE = 10000;
const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const str = (v) => (typeof v === "string" ? v.trim() : "");

const TIME_ZONE = "Asia/Jerusalem";
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const zoneFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE, hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
});

// UTC instant for a wall-clock time in Asia/Jerusalem (DST aware).
function zonedTime(y, m, d, hh, mm, ss, ms) {
  const wall = Date.UTC(y, m - 1, d, hh, mm, ss, ms);
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(zoneFormat.formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
    const shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second, ms);
    guess += wall - shown;
  }
  return new Date(guess);
}

class BadDateError extends Error {
  constructor() { super("BAD_DATE"); this.code = "BAD_DATE"; }
}

// Empty -> null; invalid -> BadDateError.
function parseDate(value, endOfDay) {
  const text = str(value);
  if (!text) return null;
  const m = DATE_ONLY.exec(text);
  if (m) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    const check = new Date(Date.UTC(y, mo - 1, d));
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) throw new BadDateError();
    return endOfDay ? zonedTime(y, mo, d, 23, 59, 59, 999) : zonedTime(y, mo, d, 0, 0, 0, 0);
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new BadDateError();
  return date;
}

function buildFilter(query = {}) {
  const filter = {};
  for (const key of ["module", "actor", "action", "targetId"]) {
    const value = str(query[key]);
    if (value) filter[key] = value;
  }
  const from = parseDate(query.from, false);
  const to = parseDate(query.to, true);
  if (from || to) filter.at = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  const q = str(query.q).slice(0, 100);
  if (q) {
    const $regex = escapeRegex(q);
    filter.$or = ["targetLabel", "actorName", "actor", "realActor", "realActorName"].map((f) => ({ [f]: { $regex, $options: "i" } }));
  }
  return filter;
}

// The audit log is an IT action (IT-site design): mounted only on /api/it.
// loadActor signs the caller in and sets req.actor (requireIt there).
function createAuditRouter({ model, loadActor }) {
  const router = express.Router();
  router.use(loadActor);

  router.get("/", requirePermission("audit.view"), async (req, res) => {
    try {
      const page = Math.min(MAX_PAGE, Math.max(1, parseInt(req.query.page, 10) || 1));
      const filter = { ...buildFilter(req.query), archivedAt: req.query.status === "archived" ? { $ne: null } : null };
      const { items, total } = await model.page(filter, { page, pageSize: PAGE_SIZE });
      return res.status(200).json({ ok: true, items, total });
    } catch (error) {
      if (error instanceof BadDateError) return res.status(400).json({ ok: false, code: "BAD_DATE" });
      logWithSource("Audit.list", error);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  });

  router.post("/archive", requirePermission("audit.view"), requirePermission("audit.archive"), async (req, res) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 200 || ids.some((id) => typeof id !== "string" || !/^[a-f\d]{24}$/i.test(id)) || typeof req.body.archived !== "boolean") {
      return res.status(400).json({ ok: false, code: "BAD_SELECTION" });
    }
    try {
      await model.archive([...new Set(ids)], req.body.archived, req.actor?.isSystem ? "system" : req.actor?.tz || "");
      return res.json({ ok: true });
    } catch (error) { logWithSource("Audit.archive", error); return res.status(500).json({ ok: false, message: SERVER_ERROR }); }
  });

  return router;
}

module.exports = { createAuditRouter, buildFilter };
