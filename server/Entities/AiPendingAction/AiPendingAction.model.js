const defaultApi = require("../api");
const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");

// AiPendingActions: actions the assistant proposed, waiting for the user's
// approval (spec, part 2). One row per proposal:
//   ownerTz, conversationId, type, params, summary { ar, he, en } (clipped,
//   for the model), details (everything that will be written, in full, for
//   the card), before,
//   createdAt, expiresAt (+15 minutes), usedAt (null until approved,
//   cancelled or discarded), status, result.
// Every query names the owner. A proposal is used once: claim() sets usedAt
// in one conditional write, so two approvals can never both run it.
// MongoDB removes rows KEEP_DAYS after they were created (TTL); the actions
// themselves stay in the audit log.
const dbName = process.env.DB_NAME || "tamheed_db";
const collection = "AiPendingActions";
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const KEEP_DAYS = 7;

function createPendingActionModel(api = defaultApi) {
  const where = { dbName, collection };
  const own = (ownerTz, id) => ({ _id: String(id), ownerTz: String(ownerTz) });

  return {
    async create(data) {
      const res = await api.create({ ...where, data: { ...data, ownerTz: String(data.ownerTz), usedAt: null, status: "pending" } });
      return res.result;
    },

    // One of the owner's actions; null if not theirs (or not an id).
    async findOwn(ownerTz, id) {
      if (!OBJECT_ID.test(String(id))) return null;
      const res = await api.read({ ...where, filter: own(ownerTz, id) });
      return res?.result?.[0] || null;
    },

    // The owner's actions in one conversation still waiting for a decision
    // (unused and unexpired at `at`): their cards after a reload.
    async listOpen(ownerTz, conversationId, at = new Date()) {
      const res = await api.read({
        ...where,
        filter: { ownerTz: String(ownerTz), conversationId: String(conversationId), usedAt: null, expiresAt: { $gt: at } },
      });
      return res?.result || [];
    },

    // Marks the action used, only if it is still unused and unexpired at
    // `at`. Returns the claimed row, or null when another request got there
    // first, it expired, or it is not theirs.
    async claim(ownerTz, id, at, status) {
      if (!OBJECT_ID.test(String(id))) return null;
      const res = await api.updateExisting({
        ...where,
        filter: { ...own(ownerTz, id), usedAt: null, expiresAt: { $gt: at } },
        newData: { usedAt: at, status },
      });
      return res?.result || null;
    },

    // The outcome of a claimed action (status, result).
    async finish(ownerTz, id, fields) {
      if (!OBJECT_ID.test(String(id))) return null;
      const res = await api.updateExisting({ ...where, filter: own(ownerTz, id), newData: fields });
      return res?.result || null;
    },

    // Proposals whose chat round was never stored: used up without running.
    async discard(ownerTz, ids, at = new Date()) {
      const list = (Array.isArray(ids) ? ids : []).map(String).filter((id) => OBJECT_ID.test(id));
      if (!list.length) return 0;
      const res = await api.updateMany({
        ...where,
        filter: { _id: { $in: list }, ownerTz: String(ownerTz), usedAt: null },
        newData: { usedAt: at, status: "discarded" },
      });
      return res?.result?.modifiedCount || 0;
    },
  };
}

const AiPendingActionModelDef = { dbName, collection, ...createPendingActionModel() };

const PENDING_ACTION_INDEXES = [
  { key: { ownerTz: 1, createdAt: -1 } },
  // listOpen: the open cards of one of the owner's conversations.
  { key: { ownerTz: 1, conversationId: 1 } },
  { key: { createdAt: 1 }, options: { expireAfterSeconds: KEEP_DAYS * 24 * 60 * 60 } },
];
const ensurePendingActionIndexes = (coll) =>
  ensureIndexes(coll || collectionOf(AiPendingActionModelDef), PENDING_ACTION_INDEXES);

module.exports = {
  AiPendingActionModelDef,
  createPendingActionModel,
  PENDING_ACTION_INDEXES,
  ensurePendingActionIndexes,
  KEEP_DAYS,
};
