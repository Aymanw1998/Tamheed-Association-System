// Short-lived cache of the active user that loadActor reads on every request
// (owner decision 2026-10-27: at most 5 s). Requests that arrive together share
// one database read. Every write through UserModelDef (an edit, a role or
// permission change, a lockout, a password change, a move between rooms)
// empties the whole cache at once, so those apply to the next request; the
// 5 s bound only covers writes made outside this process.
// A missing user is never cached, so a newly approved user signs in at once.
const TTL_MS = 5 * 1000;

function createActorCache({ load, ttlMs = TTL_MS, now = () => Date.now() }) {
  const entries = new Map(); // tz -> { at, promise }
  let generation = 0;

  // A copy, so a handler that changes req.actor.user never changes the cache.
  const copy = (user) => (user ? {
    ...user,
    ...(Array.isArray(user.roles) ? { roles: [...user.roles] } : {}),
    ...(Array.isArray(user.permissionGrants) ? { permissionGrants: [...user.permissionGrants] } : {}),
    ...(Array.isArray(user.permissionRevokes) ? { permissionRevokes: [...user.permissionRevokes] } : {}),
  } : user);

  async function get(tz) {
    const key = String(tz);
    const hit = entries.get(key);
    if (hit && now() - hit.at < ttlMs) return copy(await hit.promise);
    const startedIn = generation;
    const promise = Promise.resolve().then(() => load(key));
    entries.set(key, { at: now(), promise });
    let user;
    try {
      user = await promise;
    } catch (error) {
      if (entries.get(key)?.promise === promise) entries.delete(key);
      throw error;
    }
    // Not kept when missing, or when a write emptied the cache during the read.
    if ((!user || generation !== startedIn) && entries.get(key)?.promise === promise) entries.delete(key);
    return copy(user);
  }

  function clear() {
    generation += 1;
    entries.clear();
  }

  return { get, clear };
}

// The process-wide cache used by loadActor; User.model empties it on every write.
let shared = null;
const sharedCache = (load) => {
  if (!shared) shared = createActorCache({ load });
  return shared;
};
const clearActors = () => { if (shared) shared.clear(); };

module.exports = { createActorCache, sharedCache, clearActors, TTL_MS };
