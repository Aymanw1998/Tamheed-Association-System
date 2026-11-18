// The server's own health checks, shown on the IT site (owner, 2026-11-16):
// the nightly backup, its copy on Google Drive, the weekly restore test and
// the free disk space. Each check keeps one row in OpsStatus:
//   { check, ok, at (Date), message }
// The backup scripts (run by cron, outside the app) write their rows through
// server/scripts/opsReport.js; the app writes the disk row itself.
const api = require("../Entities/api");

const dbName = process.env.DB_NAME || "tamheed_db";
const COLLECTION = "OpsStatus";

const HOUR = 60 * 60 * 1000;
// A check that has not reported for this long counts as failed: a cron job
// that stopped running is as bad as one that fails.
const CHECKS = {
  backup: { label: "النسخ الاحتياطي الليلي", staleAfterMs: 36 * HOUR },
  offsite: { label: "نسخة على Google Drive", staleAfterMs: 36 * HOUR },
  restore: { label: "فحص الاسترجاع الأسبوعي", staleAfterMs: 8 * 24 * HOUR },
  disk: { label: "المساحة على الخادم", staleAfterMs: 3 * HOUR },
};

const MAX_MESSAGE = 300;

async function record(check, ok, message = "", now = new Date()) {
  if (!CHECKS[check]) throw new Error(`unknown check: ${check}`);
  return api.update({
    dbName,
    collection: COLLECTION,
    filter: { check },
    newData: { ok: Boolean(ok), at: now, message: String(message || "").slice(0, MAX_MESSAGE) },
  });
}

// rows: the stored rows. Every known check is listed, in a fixed order; one
// that never reported or is too old is "missing" / "stale", not ok.
function evaluate(rows = [], now = new Date()) {
  const byId = new Map((rows || []).map((row) => [String(row.check), row]));
  return Object.entries(CHECKS).map(([id, { label, staleAfterMs }]) => {
    const row = byId.get(id);
    if (!row) return { id, label, state: "missing", ok: false, at: null, message: "" };
    const at = row.at ? new Date(row.at) : null;
    const stale = !at || now.getTime() - at.getTime() > staleAfterMs;
    const state = stale ? "stale" : row.ok ? "ok" : "failed";
    return { id, label, state, ok: state === "ok", at, message: String(row.message || "") };
  });
}

async function list(now = new Date()) {
  const found = await api.read({ dbName, collection: COLLECTION, filter: {} });
  return evaluate(found?.result || [], now);
}

module.exports = { CHECKS, COLLECTION, record, evaluate, list };
