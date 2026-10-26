// Server-side enforcement of item locks and versions on write routes.
//   requireFreeOrMine(keyOf): 423 { ok:false, code:"LOCKED", holder:{name,tz} }
//     when another browser tab (X-Client-Id) holds the item's lock.
//   checkVersion(current, req): null, or the 409 STALE body when the save is
//     based on an older `updatedAt` than the stored one.
//   assertFree(key): for callers without a tab (the assistant): throws an
//     Error with status 423 and `holder` when anyone holds the key.
const { actorRef, SYSTEM_ACTOR_NAME } = require("../utils/permissions");
const LOCKED_MESSAGE = "هذا العنصر مفتوح الآن لدى مستخدم آخر";

// «هذا العنصر مفتوح الآن لدى <الاسم الكامل> (<رقم الهوية>)», without «()» when tz is empty.
function lockedMessage(holder) {
  const name = String(holder?.name || "").trim();
  if (!name) return LOCKED_MESSAGE;
  const tz = String(holder?.tz || "").trim();
  return `هذا العنصر مفتوح الآن لدى ${name}${tz ? ` (${tz})` : ""}`;
}

// «تم تعديل هذا العنصر من قِبل <الاسم> أثناء غيابك.»
function staleMessage(current) {
  const name = String(current?.updatedByName || "").trim() || "مستخدم آخر";
  return `تم تعديل هذا العنصر من قِبل ${name} أثناء غيابك.`;
}

function createLockGuard({ locks, logError = () => {} }) {
  const lockedBody = (holder) => ({ ok: false, code: "LOCKED", holder, message: lockedMessage(holder) });

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
    const error = new Error(lockedMessage(holder));
    error.status = 423;
    error.holder = holder;
    throw error;
  }

  return { requireFreeOrMine, assertFree };
}

// Who made a form save: stored next to updatedAt so a STALE answer can say
// who changed the item while the other person was away.
function editorStamp(req) {
  const actor = req?.actor;
  if (!actor) return {};
  const stamp = {};
  const id = actorRef(actor, String(actor.id ?? ""));
  const name = actor.isSystem ? SYSTEM_ACTOR_NAME : String(actor.name ?? "");
  if (id) stamp.updatedBy = id;
  if (name) stamp.updatedByName = name;
  return stamp;
}

// `view` shapes the stored document for the client (e.g. drops secrets).
function staleAnswer(current, view = (doc) => doc) {
  const shown = current ? view(current) : null;
  return { ok: false, code: "STALE", current: shown, message: staleMessage(shown || current) };
}

function checkVersion(current, req, view = (doc) => doc) {
  const base = req?.body?.baseVersion;
  if (base === undefined || base === null || base === "") return null; // old clients
  if (!current?.updatedAt) return null;
  const seen = new Date(base).getTime();
  const stored = new Date(current.updatedAt).getTime();
  if (seen === stored) return null;
  return staleAnswer(current, view);
}

// Compare-and-set for the write that follows a read: the filter also requires
// the updatedAt that was read, so a save that waited (or lost its lock) never
// overwrites what was written after the read. A record read without updatedAt
// is written only while it still has none ({ updatedAt: null } in MongoDB
// matches a missing or null field), since every guarded write stamps it.
function sameVersion(filter, current) {
  const stamp = current?.updatedAt;
  return { ...filter, updatedAt: stamp === undefined ? null : stamp };
}

// A new updatedAt that is always later than `current`'s, even within the same
// millisecond, so a compare-and-set on the old value can never match again.
// `nowMs` is the caller's clock.
function nextStamp(current, nowMs = Date.now()) {
  const before = current?.updatedAt ? new Date(current.updatedAt).getTime() : 0;
  return new Date(Math.max(nowMs, (Number.isFinite(before) ? before : 0) + 1));
}

// The 409 body when a guarded write matched nothing: the record changed (or
// was removed) after it was read. `reread` returns the model's { result: [...] }.
async function raceLost(reread, view = (doc) => doc) {
  const fresh = (await reread().catch(() => null))?.result?.[0] || null;
  return staleAnswer(fresh, view);
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

// Who holds `key`, unless it is free or held by this tab (clientId): for a
// controller that also writes items other than its route's own (a player
// save changes the rosters of sport lessons). lockedAnswer is the 423 body.
const holderOf = (key, clientId) => lazyLocks().holderOf(key, clientId ?? null);
const lockedAnswer = (holder) => ({ ok: false, code: "LOCKED", holder, message: lockedMessage(holder) });

module.exports = { ...guard, holderOf, lockedAnswer, checkVersion, sameVersion, nextStamp, raceLost, staleAnswer, editorStamp, createLockGuard, LOCKED_MESSAGE, lockedMessage, staleMessage };
