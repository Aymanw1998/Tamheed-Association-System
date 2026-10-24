// Web push sender. VAPID keys come only from the environment; without them
// every send is a no-op. `webpush` and `subscriptions` are injected so tests
// never touch the network or the database.
const GONE = new Set([404, 410]);

function createPush({ webpush, subscriptions, env = process.env }) {
  const publicKeyValue = env.VAPID_PUBLIC_KEY || null;
  const privateKey = env.VAPID_PRIVATE_KEY || null;
  const subject = env.VAPID_SUBJECT || null;
  const enabled = Boolean(publicKeyValue && privateKey && subject);

  const publicKey = () => (enabled ? publicKeyValue : null);

  async function deliver(list, payload) {
    if (!enabled || !list.length) return { sent: 0, removed: 0 };
    const body = JSON.stringify(payload);
    const options = { vapidDetails: { subject, publicKey: publicKeyValue, privateKey } };
    const results = await Promise.allSettled(list.map(async (row) => {
      try {
        await webpush.sendNotification({ endpoint: row.endpoint, keys: row.keys }, body, options);
        return "sent";
      } catch (err) {
        if (GONE.has(err?.statusCode)) {
          await subscriptions.remove(row.endpoint);
          return "removed";
        }
        throw err;
      }
    }));
    return {
      sent: results.filter((r) => r.status === "fulfilled" && r.value === "sent").length,
      removed: results.filter((r) => r.status === "fulfilled" && r.value === "removed").length,
    };
  }

  return {
    publicKey,
    sendToStaff: async (tzs, payload) => (enabled && tzs?.length ? deliver(await subscriptions.listStaff(tzs.map(String)), payload) : { sent: 0, removed: 0 }),
    sendToStudents: async (studentIds, payload) => (enabled && studentIds?.length ? deliver(await subscriptions.listStudents(studentIds.map(String)), payload) : { sent: 0, removed: 0 }),
  };
}

// The default instance. web-push is loaded lazily so a missing module or
// unset keys never break server start.
const push = createPush({
  webpush: { sendNotification: (...args) => require("web-push").sendNotification(...args) },
  subscriptions: require("../Entities/Push/PushSubscription.model").PushSubscriptionModelDef,
  env: process.env,
});

module.exports = { createPush, push };
