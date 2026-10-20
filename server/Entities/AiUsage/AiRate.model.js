const defaultApi = require("../api");
const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");

// AiRates: one row per assistant message ({ tz, at }), so a user may send at
// most RATE_LIMIT messages in any RATE_WINDOW_SECONDS. Kept in MongoDB so
// every server process shares the count; MongoDB removes rows an hour old
// (TTL index), and hit() counts by `at` itself, so a late sweep never
// lowers the limit.
const dbName = process.env.DB_NAME || "tamheed_db";
const collection = "AiRates";
const RATE_LIMIT = 30;
const RATE_WINDOW_SECONDS = 60 * 60;

function createRateModel(api = defaultApi) {
  const where = { dbName, collection };
  return {
    // Counts this message and says whether it is allowed. A refused message
    // is not counted. Insert-then-count: two racing requests can at worst
    // both be refused at the boundary, never both let through.
    async hit(tz, at = new Date()) {
      const created = await api.create({ ...where, data: { tz: String(tz), at } });
      const since = new Date(at.getTime() - RATE_WINDOW_SECONDS * 1000);
      const res = await api.read({ ...where, filter: { tz: String(tz), at: { $gt: since } } });
      const count = (res?.result || []).length;
      if (count <= RATE_LIMIT) return { allowed: true, count };
      await api.delete({ ...where, filter: { _id: created.result._id } });
      return { allowed: false, count: count - 1 };
    },
  };
}

const AiRateModelDef = { dbName, collection, ...createRateModel() };

const AI_RATE_INDEXES = [
  { key: { tz: 1, at: -1 } },
  { key: { at: 1 }, options: { expireAfterSeconds: RATE_WINDOW_SECONDS } },
];
const ensureAiRateIndexes = (coll) => ensureIndexes(coll || collectionOf(AiRateModelDef), AI_RATE_INDEXES);

module.exports = { AiRateModelDef, createRateModel, RATE_LIMIT, RATE_WINDOW_SECONDS, AI_RATE_INDEXES, ensureAiRateIndexes };
