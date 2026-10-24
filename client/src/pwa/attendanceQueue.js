// Attendance saved while offline waits here, per signed-in user, and is sent
// later. Items live in IndexedDB (database `tamheed-queue`); tests inject an
// in-memory backend. Every function is keyed by the user's tz, so one person
// never reads, sends or deletes another's items.
export const OVERWRITTEN_MESSAGE = "تم تحديث حضور سجّله شخص آخر";
export const SAVED_OFFLINE_MESSAGE = "حُفظ على الجهاز وسيُرسل عند عودة الاتصال";
export const QUEUE_CHANGED_EVENT = "tamheed:queue-changed";

const DB_NAME = "tamheed-queue";
const STORE = "items";

// A backend is { all(): Promise<row[]>, put(row): Promise<id>, remove(id): Promise<void> }.
export function createMemoryBackend() {
  const rows = new Map();
  let next = 1;
  return {
    async all() { return [...rows.values()].map((r) => ({ ...r })); },
    async put(row) {
      const id = row.id ?? next++;
      rows.set(id, { ...row, id });
      return id;
    },
    async remove(id) { rows.delete(id); },
  };
}

export function createIndexedDbBackend() {
  let dbPromise = null;
  const open = () => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      dbPromise.catch(() => { dbPromise = null; });
    }
    return dbPromise;
  };
  const run = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  };
  return {
    all: () => run("readonly", (s) => s.getAll()),
    put: (row) => run("readwrite", (s) => s.put(row)),
    remove: (id) => run("readwrite", (s) => s.delete(id)),
  };
}

let backend = null;
export function setBackend(b) { backend = b; }
const db = () => backend || (backend = createIndexedDbBackend());

const key = (tz) => String(tz || "");
const byTime = (a, b) => (a.queuedAt - b.queuedAt) || ((a.id || 0) - (b.id || 0));
const mine = async (tz) => (await db().all()).filter((r) => r.userTz === key(tz)).sort(byTime);
const changed = () => {
  try { window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT)); } catch {}
};

export async function enqueue(userTz, item) {
  if (!key(userTz)) throw new Error("no user");
  // One item per user and key (lesson + date): the newest sheet replaces any
  // older pending or failed one, so a stale sheet is never sent later.
  if (item.key) await dropKey(userTz, item.key, true);
  const id = await db().put({
    userTz: key(userTz),
    key: item.key,
    kind: item.kind,
    url: item.url,
    body: item.body,
    label: item.label,
    queuedAt: item.queuedAt ?? Date.now(),
    failed: false,
  });
  changed();
  return id;
}

// Removes this user's items with the given key (pending or failed).
export async function dropKey(userTz, itemKey, silent) {
  if (!key(userTz) || !itemKey) return;
  for (const row of await mine(userTz)) if (row.key === itemKey) await db().remove(row.id);
  if (!silent) changed();
}

// Everything waiting for this user, including items that were rejected.
export async function pending(userTz) {
  if (!key(userTz)) return [];
  return mine(userTz);
}

export async function failedItems(userTz) {
  return (await pending(userTz)).filter((r) => r.failed);
}

// Puts rejected items back in line to be sent again.
export async function retryFailed(userTz) {
  for (const row of await failedItems(userTz)) await db().put({ ...row, failed: false, message: undefined });
  changed();
}

export async function othersPending(userTz) {
  return (await db().all()).filter((r) => r.userTz !== key(userTz)).length;
}

export async function clear(userTz) {
  for (const row of await mine(userTz)) await db().remove(row.id);
  changed();
}

// Deletes the items that belong to anyone but this user.
export async function clearOthers(userTz) {
  for (const row of (await db().all()).filter((r) => r.userTz !== key(userTz))) await db().remove(row.id);
  changed();
}

const running = new Map();

// send(item) resolves to { ok, status, message?, overwritten? }.
//  ok                      -> removed from the queue
//  401, no response (0), 408, 429, 5xx -> kept, flush stops (session expired, offline, server busy)
//  any other error status              -> marked failed, flush continues
export function flush(userTz, send) {
  const k = key(userTz);
  if (!k) return Promise.resolve({ sent: 0, failed: [], overwritten: [] });
  if (running.has(k)) return running.get(k);
  const p = (async () => {
    const out = { sent: 0, failed: [], overwritten: [] };
    for (const row of (await mine(k)).filter((r) => !r.failed)) {
      let res;
      try { res = await send(row); } catch { break; }
      if (res?.ok) {
        try { await db().remove(row.id); } catch {}
        out.sent += 1;
        for (const o of res.overwritten || []) if (!out.overwritten.includes(o)) out.overwritten.push(o);
      } else if (!res || !res.status || res.status === 401 || res.status === 408 || res.status === 429 || res.status >= 500) {
        break;
      } else {
        const message = res.message || "تعذّر إرسال الحضور";
        try { await db().put({ ...row, failed: true, message }); } catch {}
        out.failed.push({ item: row, message });
      }
    }
    changed();
    return out;
  })().finally(() => running.delete(k));
  running.set(k, p);
  return p;
}
