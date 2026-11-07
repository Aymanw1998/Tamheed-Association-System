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
async function activeNotices(now = new Date()) {
  const found = await NoticeModelDef.get({});
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
  const found = await NoticeModelDef.get({});
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

async function countUnread(userId) {
  return (await activeNotices()).filter((row) => !(row.hiddenBy || []).includes(String(userId)) && !(row.readBy || []).includes(String(userId))).length;
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
  await NoticeModelDef.update({ _id: notice._id }, { readBy, readTimes });
  return { ...notice, readBy, readTimes };
}

async function markAllRead(userId) {
  const unread = (await activeNotices()).filter((row) => !(row.hiddenBy || []).includes(String(userId)) && !(row.readBy || []).includes(String(userId)));
  for (const row of unread) await markRead(row._id, userId);
  return unread.length;
}

async function archiveNotice(id, actor) {
  const notice = await findNotice(id);
  if (!notice || notice.archivedAt || notice.deletedAt || notice.category !== "manual") return null;
  const patch = { archivedAt: new Date().toISOString(), archivedBy: actorRef(actor, String(actor.id)) };
  await NoticeModelDef.update({ _id: notice._id }, patch);
  return { ...notice, ...patch };
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
    if (notice.category !== "manual") return null;
    patch = { deletedAt: new Date().toISOString(), deletedBy: actorRef(actor, me) };
  } else if (action === "restore") patch = { deletedAt: null, deletedBy: null, archivedAt: null, archivedBy: null };
  else return null;
  await NoticeModelDef.update({ _id: notice._id }, patch);
  return { ...notice, ...patch };
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

module.exports = { publishNotice, existingDedupKeys, listNotices, countUnread, markRead, markAllRead, archiveNotice, changeNoticeState, listNoticeRecipients };
