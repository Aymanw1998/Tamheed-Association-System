const defaultApi = require("../api");
const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");

// AiConversations: the assistant's chats, one row per conversation:
//   ownerTz, title, messages (Anthropic message params, tool blocks included),
//   createdAt, updatedAt, busyUntil (the in-flight lock: one turn at a time).
// Messages are only ever appended (never edited), and every query names the
// owner, so one user can never read or change another user's conversation.
// The owner can hard-delete a conversation; the alert job's daily run removes
// conversations not used for UNUSED_DAYS (services/alertJob.js).
const dbName = process.env.DB_NAME || "tamheed_db";
const collection = "AiConversations";
const UNUSED_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const MAX_TITLE = 120;
const LIST_LIMIT = 50;
// A turn holds its conversation for at most this long (a crashed process
// cannot keep it busy forever). It must outlive the worst-case turn, or an
// approval could slip its system note into a turn still being stored:
// MAX_ROUNDS (8) x (1 try + 1 SDK retry) x the 120 s client timeout = 32
// minutes, so 35. A fixed ceiling is simpler than extending the lock each
// round; a normal turn releases it as soon as it ends (unlock in finally).
const LOCK_MS = 35 * 60 * 1000;
// A conversation stops taking new turns at this many stored messages.
const MAX_STORED_MESSAGES = 400;

const staleCutoff = (now = new Date()) => new Date(now.getTime() - UNUSED_DAYS * DAY_MS);
const cleanTitle = (title) => String(title ?? "").trim().slice(0, MAX_TITLE);

function createConversationModel(api = defaultApi) {
  const where = { dbName, collection };
  const own = (ownerTz, id) => ({ _id: String(id), ownerTz: String(ownerTz) });

  return {
    async create(ownerTz, title = "", at = new Date()) {
      const res = await api.create({
        ...where,
        data: { ownerTz: String(ownerTz), title: cleanTitle(title), messages: [], createdAt: at, updatedAt: at },
      });
      return res.result;
    },

    // The owner's conversations, most recently used first, without messages.
    async listFor(ownerTz, { limit = LIST_LIMIT } = {}) {
      const res = await api.readPage({
        ...where,
        filter: { ownerTz: String(ownerTz) },
        sort: { updatedAt: -1 },
        limit,
        projection: { messages: 0 },
      });
      return { result: res.result || [], total: res.total || 0 };
    },

    // One of the owner's conversations with its messages; null if not theirs.
    async findOwn(ownerTz, id) {
      if (!OBJECT_ID.test(String(id))) return null;
      const res = await api.read({ ...where, filter: own(ownerTz, id) });
      return res?.result?.[0] || null;
    },

    // Appends messages and marks the conversation used. Null if not theirs.
    async append(ownerTz, id, messages, at = new Date()) {
      if (!OBJECT_ID.test(String(id)) || !Array.isArray(messages) || !messages.length) return null;
      const res = await api.push({ ...where, filter: own(ownerTz, id), field: "messages", items: messages, set: { updatedAt: at } });
      return res?.result || null;
    },

    // Takes the in-flight lock when it is free or expired, in one conditional
    // write. Returns the lock token (its expiry), or null when another turn
    // holds it or the conversation is not theirs.
    async lock(ownerTz, id, at = new Date()) {
      if (!OBJECT_ID.test(String(id))) return null;
      const busyUntil = new Date(at.getTime() + LOCK_MS);
      const res = await api.updateExisting({
        ...where,
        filter: { ...own(ownerTz, id), $or: [{ busyUntil: null }, { busyUntil: { $lte: at } }] },
        newData: { busyUntil },
      });
      return res?.result ? busyUntil : null;
    },

    // Releases the lock only if it is still the one `token` took.
    async unlock(ownerTz, id, token) {
      if (!OBJECT_ID.test(String(id)) || !(token instanceof Date)) return null;
      const res = await api.updateExisting({ ...where, filter: { ...own(ownerTz, id), busyUntil: token }, newData: { busyUntil: null } });
      return res?.result || null;
    },

    async rename(ownerTz, id, title) {
      if (!OBJECT_ID.test(String(id))) return null;
      const res = await api.updateExisting({ ...where, filter: own(ownerTz, id), newData: { title: cleanTitle(title) } });
      return res?.result || null;
    },

    // Hard delete (decision #5: children's data is deleted, not hidden).
    async remove(ownerTz, id) {
      if (!OBJECT_ID.test(String(id))) return 0;
      const res = await api.delete({ ...where, filter: own(ownerTz, id) });
      return res?.result?.deletedCount || 0;
    },

    async deleteUnusedBefore(cutoff) {
      const res = await api.delete({ ...where, filter: { updatedAt: { $lt: cutoff } } });
      return res?.result?.deletedCount || 0;
    },
  };
}

const AiConversationModelDef = { dbName, collection, ...createConversationModel() };

const CONVERSATION_INDEXES = [
  { key: { ownerTz: 1, updatedAt: -1 } },
  { key: { updatedAt: 1 } },
];
const ensureConversationIndexes = (coll) =>
  ensureIndexes(coll || collectionOf(AiConversationModelDef), CONVERSATION_INDEXES);

module.exports = {
  AiConversationModelDef,
  createConversationModel,
  CONVERSATION_INDEXES,
  ensureConversationIndexes,
  UNUSED_DAYS,
  staleCutoff,
  LOCK_MS,
  MAX_STORED_MESSAGES,
};
