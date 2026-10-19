const { NoticeModelDef } = require("./Notice.model.js");
const { UserModelDef } = require("../User/User.model.js");
const { can, effectivePermissions, isSystemTz, actorRef } = require("../../utils/permissions.js");

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LIST = 200;

const isDuplicate = (err) => err && (err.code === 11000 || /E11000/.test(String(err.message)));

async function publishNotice({ title, body, category, severity, link = "", dedupKey = null, createdBy = "system", createdByName = "",
  readBy = createdBy === "system" ? [] : [String(createdBy)] }) {
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

const withRead = (row, userId) => ({ ...row, read: (row.readBy || []).includes(String(userId)) });

async function activeNotices() {
  const found = await NoticeModelDef.get({});
  return (found?.result || [])
    .filter((row) => !row.archivedAt)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function listNotices({ userId, status = "all", category = "", severity = "" }) {
  return (await activeNotices())
    .map((row) => withRead(row, userId))
    .filter((row) => (status === "unread" ? !row.read : true))
    .filter((row) => (category ? row.category === category : true))
    .filter((row) => (severity ? row.severity === severity : true))
    .slice(0, MAX_LIST);
}

async function countUnread(userId) {
  return (await activeNotices()).filter((row) => !(row.readBy || []).includes(String(userId))).length;
}

async function findNotice(id) {
  if (!OBJECT_ID.test(String(id || ""))) return null;
  const found = await NoticeModelDef.get({ _id: String(id) });
  return found?.result?.[0] || null;
}

async function markRead(id, userId) {
  const notice = await findNotice(id);
  if (!notice) return null;
  const readBy = Array.from(new Set([...(notice.readBy || []), String(userId)]));
  await NoticeModelDef.update({ _id: notice._id }, { readBy });
  return { ...notice, readBy };
}

async function markAllRead(userId) {
  const unread = (await activeNotices()).filter((row) => !(row.readBy || []).includes(String(userId)));
  for (const row of unread) await markRead(row._id, userId);
  return unread.length;
}

async function archiveNotice(id, actor) {
  const notice = await findNotice(id);
  if (!notice || notice.archivedAt) return null;
  const patch = { archivedAt: new Date().toISOString(), archivedBy: actorRef(actor, String(actor.id)) };
  await NoticeModelDef.update({ _id: notice._id }, patch);
  return { ...notice, ...patch };
}

// Who receives board items by email: active users whose effective permissions
// include notices.view.
async function listNoticeRecipients() {
  const found = await UserModelDef.get({}, "active");
  return (found?.result || [])
    // The system account is never a recipient.
    .filter((user) => !isSystemTz(user.tz))
    .filter((user) => can(effectivePermissions(user), "notices.view"))
    .map((user) => ({
      id: String(user._id),
      name: [user.firstname, user.lastname].filter(Boolean).join(" ").trim(),
      email: String(user.email || "").trim(),
    }))
    .filter((user) => EMAIL.test(user.email) && user.email !== "test@test.com");
}

module.exports = { publishNotice, existingDedupKeys, listNotices, countUnread, markRead, markAllRead, archiveNotice, listNoticeRecipients };
