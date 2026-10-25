// Server-side enforcement of item locks and versions on write routes.
//   requireFreeOrMine(keyOf): 423 { ok:false, code:"LOCKED", holder:{name,tz} }
//     when another browser tab (X-Client-Id) holds the item's lock.
//   checkVersion(current, req): null, or the 409 STALE body when the save is
//     based on an older `updatedAt` than the stored one.
//   assertFree(key): for callers without a tab (the assistant): throws an
//     Error with status 423 and `holder` when anyone holds the key.
const LOCKED_MESSAGE = "هذا العنصر مفتوح الآن لدى مستخدم آخر";

function createLockGuard({ locks, logError = () => {} }) {
  const lockedBody = (holder) => ({ ok: false, code: "LOCKED", holder });

  const requireFreeOrMine = (keyOf) => async (req, res, next) => {
    try {
      const key = await keyOf(req);
      if (!key) return next(); // nothing to lock (the controller answers 404)
      const holder = await locks().holderOf(key, req.get("X-Client-Id"));
      if (holder) return res.status(423).json(lockedBody(holder));
      return next();
    } catch (error) {
      logError("lockGuard.requireFreeOrMine", error);
      return res.status(500).json({ ok: false, message: "حدث خطأ غير متوقع، حاول مرة أخرى" });
    }
  };

  async function assertFree(key) {
    const holder = await locks().holderOf(key, null);
    if (!holder) return;
    const error = new Error(LOCKED_MESSAGE);
    error.status = 423;
    error.holder = holder;
    throw error;
  }

  return { requireFreeOrMine, assertFree };
}

// `view` shapes the stored document for the client (e.g. drops secrets).
function checkVersion(current, req, view = (doc) => doc) {
  const base = req?.body?.baseVersion;
  if (base === undefined || base === null || base === "") return null; // old clients
  if (!current?.updatedAt) return null;
  const seen = new Date(base).getTime();
  const stored = new Date(current.updatedAt).getTime();
  if (seen === stored) return null;
  return { ok: false, code: "STALE", current: view(current) };
}

let defaultLocks = null;
const lazyLocks = () => {
  if (!defaultLocks) {
    const { createLocks } = require("../services/locks");
    defaultLocks = createLocks({
      model: require("../Entities/Lock/Lock.model").LockModelDef,
      hub: require("../services/liveHub").liveHub,
    });
  }
  return defaultLocks;
};

const guard = createLockGuard({
  locks: lazyLocks,
  logError: (source, error) => require("./logger").logWithSource(source, error),
});

module.exports = { ...guard, checkVersion, createLockGuard, LOCKED_MESSAGE };
