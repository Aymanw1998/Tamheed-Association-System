// The server errors of the last two minutes, kept in memory so that «الإبلاغ عن
// مشكلة» can send the exact error of the request that failed (owner, 2026-11-04).
// Each request gets an id, returned in X-Request-Id; handlers keep answering a
// general text, and the real message is caught where it is logged.
const { AsyncLocalStorage } = require("node:async_hooks");
const crypto = require("node:crypto");
const { cleanText } = require("./reportRedact");

const WINDOW_MS = 2 * 60 * 1000;
const MAX_ENTRIES = 500;

function createRecentErrors({ now = () => Date.now() } = {}) {
  const context = new AsyncLocalStorage();
  const entries = new Map();

  const prune = () => {
    for (const [id, entry] of entries) {
      if (now() - entry.at > WINDOW_MS) entries.delete(id);
    }
    while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value);
  };

  const middleware = (req, res, next) => {
    const store = { message: "", code: "", source: "" };
    const id = crypto.randomBytes(6).toString("hex");
    res.setHeader("X-Request-Id", id);
    res.on("finish", () => {
      if (res.statusCode < 500) return;
      prune();
      entries.set(id, {
        at: now(),
        status: res.statusCode,
        method: req.method,
        // Never the query string: it can hold tokens.
        path: cleanText(String(req.originalUrl || "").split("?")[0], 200),
        message: store.message,
        code: store.code,
        source: store.source,
        actorId: req.actor?.id ? String(req.actor.id) : "",
      });
    });
    context.run(store, next);
  };

  // The first error logged for a request is the one that matters.
  const note = (err, source = "") => {
    const store = context.getStore();
    if (!store || store.message || !err) return;
    store.message = cleanText(err.message || err, 500);
    store.code = cleanText(err.code || "", 60);
    store.source = cleanText(source, 80);
  };

  const find = (id) => {
    const entry = entries.get(String(id ?? ""));
    if (!entry || now() - entry.at > WINDOW_MS) return null;
    return entry;
  };

  // Reported once: a second press finds nothing.
  const take = (id) => {
    const entry = find(id);
    if (entry) entries.delete(String(id));
    return entry;
  };

  return { middleware, note, find, take };
}

module.exports = { createRecentErrors, WINDOW_MS, recentErrors: createRecentErrors() };
