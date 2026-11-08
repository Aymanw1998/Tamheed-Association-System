const { NoticeModelDef } = require("./Notice.model.js");
const { UserModelDef } = require("../User/User.model.js");
const { can, effectivePermissions, isSystemTz, actorRef, isHiddenUser } = require("../../utils/permissions.js");

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LIST = 200;

const isDuplicate = (err) => err && (err.code === 11000 || /E11000/.test(String(err.message)));
// A notice someone read is gone for them this long after (owner, 2026-11-02);
// a vehicle notice stays until the renewal removes it (services/recordAlerts).
const READ_KEEP_MS = 30 * 24 * 60 * 60 * 1000;
// A notice in the trash is deleted for good this long after (owner, 2026-11-08):
// its expireAt moves here, so the TTL index purges it. The end date it had
// before is kept in keptExpireAt for a restore.
const TRASH_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

// MongoDB filters that narrow each read to the rows it can use; the in-memory
// filters after them stay as they were (the same rules, checked once more).
const notExpired = (now) => ({ $or: [{ expireAt: null }, { expireAt: { $gt: now } }] });
const notHiddenFor = (userId) => ({ hiddenBy: { $ne: String(userId) } });
const ON_BOARD = { archivedAt: null, deletedAt: null };
function listQuery({ userId, status, canManageTrash, category, severity, now }) {
  const me = String(userId);
  const parts = [notExpired(now)];
  if (status === "deleted") parts.push(canManageTrash ? { $or: [{ deletedAt: { $ne: null } }, { hiddenBy: me }] } : { hiddenBy: me });
  else if (status === "archived") parts.push({ archivedAt: { $ne: null }, deletedAt: null }, notHiddenFor(me));
  else parts.push(ON_BOARD, notHiddenFor(me));
  if (status === "unread") parts.push({ readBy: { $ne: me } });
  if (category) parts.push({ category: String(category) });
  if (severity) parts.push({ severity: String(severity) });
  return { $and: parts };
}

// endDate ("YYYY-MM-DD") and expireAt (a Date, for the TTL index) together:
// an end date the author chose.
async function publishNotice({ title, body, category, severity, link = "", dedupKey = null, createdBy = "system", createdByName = "",
  readBy = createdBy === "system" ? [] : [String(createdBy)], endDate = "", expireAt = null }) {
  if (dedupKey) {
    const found = await NoticeModelDef.get({ dedupKey });
    if (found?.result?.length) return { created: false, notice: found.result[0] };
  }
  const data = {
    title, body, category, severity, link, createdBy, createdByName,
    createdAt: new Date().toISOString(),
    readBy,
    archivedAt: null, archivedBy: null,
  };
  if (dedupKey) data.dedupKey = dedupKey;
  if (endDate && expireAt) Object.assign(data, { endDate, expireAt });
  try {
    const created = await NoticeModelDef.create(data);
    return { created: true, notice: created.result };
  } catch (err) {
    if (isDuplicate(err)) return { created: false, notice: null };
    throw err;
  }
}

async function existingDedupKeys(prefix = "vehicle:") {
  const found = await NoticeModelDef.get({ dedupKey: { $regex: `^${prefix}` } });
  return new Set((found?.result || []).map((row) => row.dedupKey));
}

// Who read a notice stays here: the browser needs only "did I".
const withRead = ({ readBy, readTimes, hiddenBy, ...row }, userId) => ({ ...row, read: (readBy || []).includes(String(userId)), hiddenForMe: (hiddenBy || []).includes(String(userId)) });

// Past its end date a notice is gone at once, before the TTL index deletes it.
async function activeNotices(now = new Date(), extra = []) {
  const found = await NoticeModelDef.get({ $and: [ON_BOARD, notExpired(now), ...extra] });
  return (found?.result || [])
    .filter((row) => !row.archivedAt)
    .filter((row) => !row.deletedAt)
    .filter((row) => !row.expireAt || new Date(row.expireAt) > now)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// Read more than 30 days ago by this user: no longer theirs to see. Rows read
// before read times were kept count from when they were posted.
function stillShown(row, userId, now) {
  if (row.category === "vehicle") return true;
  const reader = String(userId);
  if (!(row.readBy || []).includes(reader)) return true;
  const readAt = new Date(row.readTimes?.[reader] || row.createdAt || 0);
  return now - readAt <= READ_KEEP_MS;
}

async function listNotices({ userId, status = "all", category = "", severity = "", skip = 0, canManageTrash = false }) {
  const now = new Date();
  const found = await NoticeModelDef.get(listQuery({ userId, status, canManageTrash, category, severity, now }));
  return (found?.result || [])
    .filter((row) => !row.expireAt || new Date(row.expireAt) > now)
    .filter((row) => status === "deleted" ? (canManageTrash && Boolean(row.deletedAt)) || (row.hiddenBy || []).includes(String(userId)) : status === "archived" ? row.archivedAt && !row.deletedAt && !(row.hiddenBy || []).includes(String(userId)) : !row.archivedAt && !row.deletedAt && !(row.hiddenBy || []).includes(String(userId)))
    .filter((row) => status === "archived" || status === "deleted" || stillShown(row, userId, now))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((row) => withRead(row, userId))
    .filter((row) => (status === "unread" ? !row.read : true))
    .filter((row) => (category ? row.category === category : true))
    .filter((row) => (severity ? row.severity === severity : true))
    .slice(skip, skip + MAX_LIST);
}

const unreadFor = (userId) => [notHiddenFor(userId), { readBy: { $ne: String(userId) } }];

async function countUnread(userId) {
  return (await activeNotices(new Date(), unreadFor(userId))).filter((row) => !(row.hiddenBy || []).includes(String(userId)) && !(row.readBy || []).includes(String(userId))).length;
}

async function findNotice(id) {
  if (!OBJECT_ID.test(String(id || ""))) return null;
  const found = await NoticeModelDef.get({ _id: String(id) });
  return found?.result?.[0] || null;
}

async function markRead(id, userId) {
  const notice = await findNotice(id);
  if (!notice) return null;
  const reader = String(userId);
  const readBy = Array.from(new Set([...(notice.readBy || []), reader]));
  const readTimes = { ...(notice.readTimes || {}), [reader]: notice.readTimes?.[reader] || new Date().toISOString() };
  // Never upserts: a notice purged meanwhile is not recreated as an empty row.
  if (!(await NoticeModelDef.updateIf({ _id: notice._id }, { readBy, readTimes }))) return null;
  return { ...notice, readBy, readTimes };
}

async function markAllRead(userId) {
  const unread = (await activeNotices(new Date(), unreadFor(userId))).filter((row) => !(row.hiddenBy || []).includes(String(userId)) && !(row.readBy || []).includes(String(userId)));
  // One update for all of them (was a read and a write per notice).
  // A reader id is a field name in readTimes, so only a plain id goes in one update.
  if (/^[A-Za-z0-9_-]+$/.test(String(userId))) {
    if (unread.length) await NoticeModelDef.markReadMany(unread.map((row) => row._id), String(userId), new Date().toISOString());
  } else for (const row of unread) await markRead(row._id, userId);
  return unread.length;
}

// The notice as read: its id and trash/archive state (null matches a missing field).
const sameState = (notice) => ({ _id: notice._id, deletedAt: notice.deletedAt ?? null, archivedAt: notice.archivedAt ?? null });

async function archiveNotice(id, actor) {
  const notice = await findNotice(id);
  if (!notice || notice.archivedAt || notice.deletedAt || notice.category !== "manual") return null;
  const patch = { archivedAt: new Date().toISOString(), archivedBy: actorRef(actor, String(actor.id)) };
  return (await NoticeModelDef.updateIf(sameState(notice), patch)) ? { ...notice, ...patch } : null;
}

async function changeNoticeState(id, actor, action) {
  const notice = await findNotice(id); if (!notice) return null;
  const me = String(actor.id);
  let patch;
  if (action === "hide" || action === "unhide") {
    const hidden = new Set(notice.hiddenBy || []); action === "hide" ? hidden.add(me) : hidden.delete(me);
    patch = { hiddenBy: [...hidden] };
    await NoticeModelDef.setHidden(notice._id, me, action === "hide");
    return { ...notice, ...patch };
  } else if (action === "delete") {
    // Automatic system notices retain their source lifecycle; dismissal is personal.
    if (notice.category !== "manual" || notice.deletedAt) return null;
    const now = new Date();
    const purgeAt = new Date(now.getTime() + TRASH_KEEP_MS);
    const ends = notice.expireAt ? new Date(notice.expireAt) : null;
    patch = { deletedAt: now.toISOString(), deletedBy: actorRef(actor, me),
      expireAt: ends && ends < purgeAt ? ends : purgeAt, keptExpireAt: notice.expireAt || null };
  } else if (action === "restore") {
    patch = { deletedAt: null, deletedBy: null, archivedAt: null, archivedBy: null };
    if (notice.deletedAt) Object.assign(patch, { expireAt: notice.keptExpireAt || null, keptExpireAt: null });
  } else return null;
  // Only if no one changed the notice's state since it was read: a concurrent
  // trash, restore or purge makes this a 404 instead of a mixed state (and a
  // purged row is never recreated: updateIf does not upsert).
  const saved = await NoticeModelDef.updateIf(sameState(notice), patch);
  return saved ? { ...notice, ...patch } : null;
}

// Deletes a manual notice that is in the trash, for good (notices.purge).
async function purgeNotice(id) {
  const notice = await findNotice(id);
  if (!notice || !notice.deletedAt || notice.category !== "manual") return null;
  // Zero rows: restored (or purged) meanwhile, so nothing was deleted.
  const removed = await NoticeModelDef.remove(sameState(notice));
  return removed ? notice : null;
}

// Who receives board items by email: active users whose effective permissions
// include notices.view.
async function listNoticeRecipients() {
  const found = await UserModelDef.get({}, "active");
  return (found?.result || [])
    // The system account is never a recipient.
    .filter((user) => !isHiddenUser(user))
    .filter((user) => can(effectivePermissions(user), "notices.view"))
    .map((user) => ({
      id: String(user._id),
      name: [user.firstname, user.lastname].filter(Boolean).join(" ").trim(),
      email: String(user.email || "").trim(),
    }))
    .filter((user) => EMAIL.test(user.email) && user.email !== "test@test.com");
}

module.exports = { publishNotice, existingDedupKeys, listNotices, countUnread, markRead, markAllRead, archiveNotice, changeNoticeState, purgeNotice, listNoticeRecipients, TRASH_KEEP_MS };
