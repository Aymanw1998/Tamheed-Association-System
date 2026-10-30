// Web push sender. The keys come from the environment (VAPID_*) or, when it
// has none, from the PushSettings row, made on the first switch-on by an
// admin. The admin switch turns every send off for both. `webpush`,
// `subscriptions` and `settings` are injected so tests never touch the
// network or the database.
const { logWithSource } = require("../middleware/logger");

const GONE = new Set([404, 410]);
// Each process rereads the switch at most this often (a switch made in this
// process applies at once).
const SETTINGS_TTL_MS = 30 * 1000;

function createPush({ webpush, subscriptions, settings = null, env = process.env, now = () => Date.now() }) {
  const envKeys = env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT
    ? { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT }
    : null;
  const rowKeys = (row) => (row?.publicKey && row?.privateKey && row?.subject ? row : null);

  let cache = null; // { at, row }
  // Bumped by every switch: a read that started before it never refills the cache.
  let generation = 0;
  async function readRow() {
    if (!settings) return null;
    if (cache && now() - cache.at < SETTINGS_TTL_MS) return cache.row;
    const started = generation;
    const row = await settings.read();
    if (started === generation) cache = { at: now(), row };
    return row;
  }

  // With no row yet, keys in the environment mean on (as before the switch existed).
  const describe = (row) => {
    const keys = envKeys || rowKeys(row);
    return {
      keys: keys && (row ? row.enabled === true : true) ? keys : null,
      keysFrom: envKeys ? "env" : keys ? "server" : "none",
    };
  };

  // The keys to send with, or null when phone notifications are off.
  async function current() {
    try {
      return describe(await readRow()).keys;
    } catch (err) {
      logWithSource("Push.settings read failed:", err?.message);
      return null;
    }
  }

  const publicKey = async () => (await current())?.publicKey || null;

  // For the admin screen: never the keys themselves.
  async function status() {
    const { keys, keysFrom } = describe(await readRow());
    return { enabled: Boolean(keys), keysFrom };
  }

  // Switching on with no keys anywhere makes a new pair, kept in the row.
  // Switching off keeps the keys, so the phones that were on keep working
  // once it is switched on again. Switches run one at a time, so two first
  // switch-ons never make two pairs (the server runs one process:
  // deploy/ecosystem.config.js).
  let queue = Promise.resolve();
  function setEnabled(enabled, options) {
    const run = queue.then(() => applySwitch(enabled, options));
    queue = run.catch(() => {});
    return run;
  }
  async function applySwitch(enabled, { subject, by } = {}) {
    if (!settings) throw new Error("push settings store missing");
    generation += 1;
    cache = null;
    const row = await settings.read();
    const data = { enabled: Boolean(enabled), updatedAt: new Date(), updatedBy: by ? String(by) : null };
    if (enabled && !envKeys && !rowKeys(row)) {
      const pair = webpush.generateVAPIDKeys();
      Object.assign(data, { publicKey: pair.publicKey, privateKey: pair.privateKey, subject });
    }
    await settings.write(data);
    generation += 1;
    cache = null;
    return status();
  }

  async function deliver(keys, list, payload) {
    if (!list.length) return { sent: 0, removed: 0 };
    const body = JSON.stringify(payload);
    const options = { vapidDetails: { subject: keys.subject, publicKey: keys.publicKey, privateKey: keys.privateKey } };
    const results = await Promise.allSettled(list.map(async (row) => {
      try {
        await webpush.sendNotification({ endpoint: row.endpoint, keys: row.keys }, body, options);
        return "sent";
      } catch (err) {
        if (GONE.has(err?.statusCode)) {
          await subscriptions.remove(row.endpoint);
          return "removed";
        }
        throw Object.assign(new Error("push failed"), { statusCode: err?.statusCode, pushEndpoint: row.endpoint });
      }
    }));
    // One line per send: status code and push-service host only (no URL, no keys).
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length) {
      const hostOf = (endpoint) => { try { return new URL(endpoint).hostname; } catch { return "unknown"; } };
      const detail = failures.map((r) => `${r.reason?.statusCode || "error"}@${hostOf(r.reason?.pushEndpoint)}`).join(", ");
      logWithSource("Push.send failed:", detail);
    }
    return {
      sent: results.filter((r) => r.status === "fulfilled" && r.value === "sent").length,
      removed: results.filter((r) => r.status === "fulfilled" && r.value === "removed").length,
    };
  }

  const NONE = { sent: 0, removed: 0 };
  return {
    publicKey,
    status,
    setEnabled,
    sendToStaff: async (tzs, payload) => {
      const keys = tzs?.length ? await current() : null;
      return keys ? deliver(keys, await subscriptions.listStaff(tzs.map(String)), payload) : NONE;
    },
    sendToStudents: async (studentIds, payload) => {
      const keys = studentIds?.length ? await current() : null;
      return keys ? deliver(keys, await subscriptions.listStudents(studentIds.map(String)), payload) : NONE;
    },
  };
}

// The default instance. web-push is loaded lazily so a missing module or
// unset keys never break server start.
const push = createPush({
  webpush: {
    sendNotification: (...args) => require("web-push").sendNotification(...args),
    generateVAPIDKeys: () => require("web-push").generateVAPIDKeys(),
  },
  subscriptions: require("../Entities/Push/PushSubscription.model").PushSubscriptionModelDef,
  settings: require("../Entities/Push/PushSettings.model").PushSettingsModelDef,
  env: process.env,
});

module.exports = { createPush, push };
