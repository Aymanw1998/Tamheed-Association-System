// Which notices a student has seen on this device: the newest createdAt shown
// on their notices tab, kept per student (`key`, the opaque student.key from
// /me) so a shared phone keeps each student's "new" marks apart. A
// convenience only: blocked storage just shows every notice as new.
export const NOTICES_SEEN_KEY = "tamheed-sport-notices-seen";

const storageKey = (key) => `${NOTICES_SEEN_KEY}:${key || "-"}`;
const time = (v) => {
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
};

export const readSeen = (key) => {
  try {
    return Number(localStorage.getItem(storageKey(key))) || 0;
  } catch {
    return 0;
  }
};

export const markSeen = (notices, key) => {
  const newest = Math.max(0, ...(notices || []).map((n) => time(n.createdAt)));
  if (!newest) return;
  try {
    localStorage.setItem(storageKey(key), String(Math.max(newest, readSeen(key))));
  } catch {
    // storage blocked
  }
};

// How many notices are newer than the last one seen.
export const unseenCount = (notices, seen) => (notices || []).filter((n) => time(n.createdAt) > seen).length;
