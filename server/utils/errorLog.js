// Server errors kept for the IT site's weekly summary (owner, 2026-11-16).
// Every answer of 500 or more is written here (utils/recentErrors.js), kept
// 90 days. The IT site shows the last 7 days grouped by error («ملخص الأخطاء»).
// No user, no query string, no body: only where it failed and the message.
const api = require("../Entities/api");
const { logWithSource } = require("../middleware/logger");

const dbName = process.env.DB_NAME || "tamheed_db";
const COLLECTION = "ErrorLog";
const KEEP_DAYS = 90;
const MAX_PER_HOUR = 300; // a storm of the same failure is counted, not stored row by row
const DAY_MS = 24 * 60 * 60 * 1000;

// IDs in a path become ":id", so the same failure on different records groups together.
const pathPattern = (path) => String(path || "")
  .split("/")
  .map((part) => (/^[0-9a-f]{24}$/i.test(part) || /^\d{3,}$/.test(part) || /•/.test(part) ? ":id" : part))
  .join("/");

function createErrorLog({
  create = (data) => api.create({ dbName, collection: COLLECTION, data }),
  read = (filter) => api.read({ dbName, collection: COLLECTION, filter }),
  now = () => new Date(),
  log = logWithSource,
} = {}) {
  let hour = "";
  let written = 0;
  let dropped = 0;

  // Never throws.
  async function record({ status, method, path, message, code, source }) {
    try {
      const at = now();
      const thisHour = at.toISOString().slice(0, 13);
      if (thisHour !== hour) { hour = thisHour; written = 0; dropped = 0; }
      if (written >= MAX_PER_HOUR) { dropped += 1; return false; }
      written += 1;
      await create({
        at,
        status: Number(status) || 500,
        action: `${String(method || "").toUpperCase()} ${pathPattern(path)}`.trim(),
        message: String(message || "").slice(0, 500),
        code: String(code || "").slice(0, 60),
        source: String(source || "").slice(0, 80),
      });
      return true;
    } catch (err) {
      log("errorLog.record", err);
      return false;
    }
  }

  // The last `days` days, grouped by where and what failed; the most frequent first.
  async function summary({ days = 7 } = {}) {
    const end = now();
    const since = new Date(end.getTime() - days * DAY_MS);
    const rows = ((await read({ at: { $gte: since } }))?.result || []).filter((row) => new Date(row.at) >= since);
    const groups = new Map();
    const perDay = new Map();
    for (const row of rows) {
      const key = [row.source, row.code, row.message, row.action].join("|");
      const group = groups.get(key) || { source: row.source || "", code: row.code || "", message: row.message || "", action: row.action || "", status: row.status, count: 0, firstAt: row.at, lastAt: row.at };
      group.count += 1;
      if (new Date(row.at) < new Date(group.firstAt)) group.firstAt = row.at;
      if (new Date(row.at) > new Date(group.lastAt)) group.lastAt = row.at;
      groups.set(key, group);
      const day = new Date(row.at).toISOString().slice(0, 10);
      perDay.set(day, (perDay.get(day) || 0) + 1);
    }
    return {
      since,
      days,
      total: rows.length,
      perDay: [...perDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => ({ day, count })),
      groups: [...groups.values()].sort((a, b) => b.count - a.count || new Date(b.lastAt) - new Date(a.lastAt)).slice(0, 30),
    };
  }

  return { record, summary, droppedThisHour: () => dropped };
}

const errorLog = createErrorLog();

const TTL_INDEX = { key: { at: 1 }, options: { expireAfterSeconds: KEEP_DAYS * DAY_MS / 1000 } };
async function ensureErrorLogIndexes(collection) {
  const target = collection || require("mongoose").connection.useDb(dbName, { useCache: true }).collection(COLLECTION);
  await target.createIndex(TTL_INDEX.key, TTL_INDEX.options);
}

module.exports = { createErrorLog, errorLog, ensureErrorLogIndexes, pathPattern, KEEP_DAYS, MAX_PER_HOUR, TTL_INDEX };
