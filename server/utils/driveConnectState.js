// One-time "state" values for the Google Drive OAuth flow. An administrator
// asks for a connect URL from inside the app; the state ties Google's callback
// to that request, so nobody can open the flow from outside and swap the
// app's single Drive account for their own. Kept in memory: a state only has
// to survive the few minutes the admin spends on Google's consent screen.
const crypto = require("crypto");

const DEFAULT_TTL_MS = 10 * 60 * 1000;

function createDriveConnectState({ ttlMs = DEFAULT_TTL_MS } = {}) {
  const pending = new Map(); // state -> { userId, actor?, expiresAt }

  const prune = (now) => {
    for (const [key, entry] of pending) {
      if (entry.expiresAt < now) pending.delete(key);
    }
  };

  return {
    // `actor` (optional): who asked, handed back by consume for the audit log.
    issue(userId, now = Date.now(), actor = undefined) {
      prune(now);
      const token = crypto.randomBytes(24).toString("hex");
      pending.set(token, { userId: String(userId), ...(actor ? { actor } : {}), expiresAt: now + ttlMs });
      return token;
    },
    // Returns { userId[, actor] } once for a valid, unexpired state; null otherwise.
    consume(token, now = Date.now()) {
      if (typeof token !== "string" || !pending.has(token)) return null;
      const entry = pending.get(token);
      pending.delete(token);
      if (entry.expiresAt < now) return null;
      return entry.actor ? { userId: entry.userId, actor: entry.actor } : { userId: entry.userId };
    },
  };
}

module.exports = { createDriveConnectState };
