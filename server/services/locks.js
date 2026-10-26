// Item locks owned by a browser tab (clientId). One row per key in the Locks
// collection; the unique index on `key` makes acquire atomic: the conditional
// upsert matches only a free/expired row or the caller's own, so any other
// holder makes MongoDB raise a duplicate-key error (E11000).
const LOCK_TTL_MS = 120 * 1000;

const isDuplicateKey = (error) => error?.code === 11000;

// MongoDB reads an ObjectId in any letter case as the same record, so the
// 24-hex segments of a key are lowercased: report:ABC… and report:abc… are one lock.
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const normalizeKey = (key) => String(key).split(":").map((part) => (OBJECT_ID.test(part) ? part.toLowerCase() : part)).join(":");

function createLocks({ model, hub, now = () => Date.now() }) {
  const at = (ms) => new Date(ms);
  const first = (res) => (res?.result || [])[0] || null;

  async function currentHolder(key) {
    key = normalizeKey(key);
    const row = first(await model.get({ key }));
    return row ? { name: row.name, tz: row.tz } : null;
  }

  async function acquire(key, owner) {
    key = normalizeKey(key);
    // Whether this tab already held the key (a refresh), so a one-shot caller
    // knows not to release a lock it did not create.
    const prior = first(await model.get({ key }));
    const created = !(prior && prior.clientId === owner.clientId && new Date(prior.expiresAt).getTime() >= now());
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const t = now();
      try {
        const res = await model.acquire(
          { key, $or: [{ expiresAt: { $lt: at(t) } }, { clientId: owner.clientId }] },
          {
            key,
            clientId: owner.clientId,
            userId: String(owner.userId ?? ""),
            tz: String(owner.tz ?? ""),
            name: String(owner.name ?? ""),
            acquiredAt: at(t),
            heartbeatAt: at(t),
            expiresAt: at(t + LOCK_TTL_MS),
          },
        );
        hub.broadcastStaff("lock", { key });
        return { ok: true, lock: res.result, created };
      } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        const holder = await currentHolder(key);
        if (holder) return { ok: false, holder };
        // The holder vanished between the conflict and the read: try again.
      }
    }
    return { ok: false, holder: { name: "", tz: "" } };
  }

  async function heartbeat(key, clientId) {
    key = normalizeKey(key);
    const t = now();
    const res = await model.updateExisting(
      { key, clientId },
      { heartbeatAt: at(t), expiresAt: at(t + LOCK_TTL_MS) },
    );
    return Boolean(res?.result);
  }

  async function release(key, clientId) {
    key = normalizeKey(key);
    const res = await model.delete({ key, clientId });
    if (res?.result?.deletedCount > 0) hub.broadcastStaff("lock", { key });
  }

  async function forceRelease(key) {
    key = normalizeKey(key);
    const res = await model.delete({ key });
    const removed = res?.result?.deletedCount > 0;
    if (removed) hub.broadcastStaff("lock", { key });
    return removed;
  }

  async function holderOf(key, clientId) {
    key = normalizeKey(key);
    const row = first(await model.get({ key }));
    if (!row || new Date(row.expiresAt).getTime() < now() || row.clientId === clientId) return null;
    return { name: row.name, tz: row.tz };
  }

  return { acquire, heartbeat, release, forceRelease, holderOf };
}

module.exports = { createLocks, normalizeKey, LOCK_TTL_MS };
