// api.js never creates indexes, so each model lists its own and server.js
// creates them at startup. An index is { key, options? }; options go straight
// to MongoDB (e.g. { unique: true } or a TTL: { expireAfterSeconds: 60 }).
async function ensureIndexes(collection, indexes) {
  for (const { key, options } of indexes) await collection.createIndex(key, options || {});
}

// The raw MongoDB collection behind an api.js model definition.
function collectionOf(modelDef) {
  return require("mongoose").connection
    .useDb(modelDef.dbName, { useCache: true })
    .collection(modelDef.collection);
}

module.exports = { ensureIndexes, collectionOf };
