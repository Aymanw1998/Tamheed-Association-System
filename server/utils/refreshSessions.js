// Sign-in sessions of one account. Each device keeps its own refresh token;
// the account stores only their hashes (refreshHashes), newest last, so
// signing in on a phone does not end the session on a computer.
//
// refreshHash (one hash) is the field from before this change: a session
// that still matches it keeps working, and moves to the list at its next
// refresh. The model's writes are atomic (UserModelDef.addRefreshHash and
// dropRefreshHash), so two devices refreshing at once never drop each other.
//
// "My devices": each session also has an entry in deviceTokens
// { sid, hash, label, startedAt, lastSeenAt }. sid is the session's id, kept
// across refreshes and carried in its tokens, so a device signed out from
// the list is refused at once, not when its access token expires. The field
// name ends in "Tokens" so the audit log hides it (utils/audit.js).

const crypto = require("crypto");

// Devices kept per account; signing in on one more ends the oldest.
const MAX_SESSIONS = 10;

const newSessionId = () => crypto.randomUUID();

// "Chrome · Android" from a User-Agent line; "" when unknown. Only the
// name is stored, never the whole line.
function deviceLabel(userAgent) {
  const ua = String(userAgent || "");
  const os = /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) ? "iPad"
    : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows"
    : /Macintosh|Mac OS X/.test(ua) ? "Mac"
    : /Linux/.test(ua) ? "Linux" : "";
  const browser = /Edg(e|A|iOS)?\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /SamsungBrowser/.test(ua) ? "Samsung Internet"
    : /Firefox\/|FxiOS/.test(ua) ? "Firefox"
    : /Chrome\/|CriOS/.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari" : "";
  return [browser, os].filter(Boolean).join(" · ");
}

function sessionMatches(user, hash) {
  if (!user || !hash) return false;
  if (Array.isArray(user.refreshHashes) && user.refreshHashes.includes(hash)) return true;
  return user.refreshHash === hash;
}

// device: { sid, label }. Without it (callers from before), no list entry.
async function startSession(model, tz, hash, device) {
  const now = new Date();
  const entry = device ? { sid: device.sid, hash, label: device.label || "", startedAt: now, lastSeenAt: now } : undefined;
  await model.addRefreshHash(tz, hash, MAX_SESSIONS, false, entry);
}

// The new token is added before the old one goes, so a failure in between
// leaves the device signed in rather than out. The device keeps its entry's
// name and start time; a session from before the list gets one now.
async function rotateSession(model, user, oldHash, newHash, device) {
  let entry;
  if (device) {
    const before = (user.deviceTokens || []).find((d) => d.hash === oldHash);
    const now = new Date();
    entry = {
      sid: before?.sid || device.sid,
      hash: newHash,
      label: before ? before.label : device.label || "",
      startedAt: before?.startedAt || now,
      lastSeenAt: now,
    };
  }
  await model.addRefreshHash(user.tz, newHash, MAX_SESSIONS, user.refreshHash === oldHash, entry);
  await model.dropRefreshHash(user.tz, oldHash);
}

async function endSession(model, tz, hash) {
  await model.dropRefreshHash(tz, hash);
}

// Every session but this device's ("sign out other devices").
async function endOtherSessions(model, tz, keepHash) {
  await model.keepOnlyRefreshHash(tz, keepHash);
}

// The patch that ends every device's session (password reset, recovery).
const endAllSessions = () => ({ refreshHash: null, refreshHashes: [], deviceTokens: [] });

const liveDevices = (user) => {
  const hashes = new Set(Array.isArray(user?.refreshHashes) ? user.refreshHashes : []);
  return (Array.isArray(user?.deviceTokens) ? user.deviceTokens : []).filter((d) => d && hashes.has(d.hash));
};

// The devices still signed in, most recently used first, without hashes.
function deviceList(user, currentSid) {
  return liveDevices(user)
    .map((d) => ({
      sid: d.sid,
      label: d.label || "",
      startedAt: d.startedAt,
      lastSeenAt: d.lastSeenAt,
      current: Boolean(currentSid) && d.sid === currentSid,
    }))
    .sort((a, b) => new Date(b.lastSeenAt || 0) - new Date(a.lastSeenAt || 0));
}

const findDevice = (user, sid) => (sid ? liveDevices(user).find((d) => d.sid === sid) || null : null);

// True when a token's session was signed out from the device list. Tokens
// without a sid (signed before session ids) and accounts with no list are
// never refused here; they end with their refresh token.
function sessionEnded(sid, user) {
  if (!sid || !Array.isArray(user?.deviceTokens)) return false;
  return !findDevice(user, sid);
}

module.exports = {
  MAX_SESSIONS,
  newSessionId,
  deviceLabel,
  sessionMatches,
  startSession,
  rotateSession,
  endSession,
  endOtherSessions,
  endAllSessions,
  deviceList,
  findDevice,
  sessionEnded,
};
