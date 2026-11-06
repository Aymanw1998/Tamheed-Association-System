const api = require("../api");

const dbName = process.env.DB_NAME || "tamheed_db";

// The association's rules. A new text is a new row: a signed version never changes.
//   { version, text, createdAt, createdByName }
const RulesModelDef = { dbName, collection: "AssociationRules" };
RulesModelDef.get = async function (filter = {}) {
  return await api.read({ dbName: this.dbName, collection: this.collection, filter });
};
RulesModelDef.create = async function (data) {
  return await api.create({ dbName: this.dbName, collection: this.collection, data });
};

// A parent's signature on a version of the rules, apart from the student so no
// list ever carries it, and only the rules' editors can read it.
//   { studentId, tz, rulesVersion, signerName, signature, signedAt }
const ConsentModelDef = { dbName, collection: "StudentConsents" };
ConsentModelDef.get = async function (filter = {}) {
  return await api.read({ dbName: this.dbName, collection: this.collection, filter });
};
ConsentModelDef.create = async function (data) {
  await ensureConsentIndexes();
  return await api.create({ dbName: this.dbName, collection: this.collection, data });
};
ConsentModelDef.updateExisting = async function (filter, newData) {
  return await api.updateExisting({ dbName: this.dbName, collection: this.collection, filter, newData });
};
ConsentModelDef.delete = async function (filter) {
  return await api.delete({ dbName: this.dbName, collection: this.collection, filter });
};

// Updating a signature never discards the previously accepted evidence.
// Deterministic snapshot _ids make archiving safe to retry before the CAS write.
const ConsentHistoryModelDef = { dbName, collection: "StudentConsentHistory" };
ConsentHistoryModelDef.create = async function (data) {
  return await api.create({ dbName: this.dbName, collection: this.collection, data });
};
ConsentHistoryModelDef.get = async function (filter = {}) {
  return await api.read({ dbName: this.dbName, collection: this.collection, filter });
};
ConsentHistoryModelDef.delete = async function (filter) {
  return await api.delete({ dbName: this.dbName, collection: this.collection, filter });
};

// Two publishes at once cannot both take the same version.
const RULES_INDEXES = [{ key: { version: 1 }, options: { unique: true } }];
const CONSENT_INDEXES = [{ key: { studentId: 1 }, options: { unique: true } }];
let consentIndexReady;
function ensureConsentIndexes() {
  if (!consentIndexReady) {
    const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");
    consentIndexReady = ensureIndexes(collectionOf(ConsentModelDef), CONSENT_INDEXES)
      .catch((error) => { consentIndexReady = null; throw error; });
  }
  return consentIndexReady;
}
async function ensureRulesIndexes() {
  const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");
  await ensureIndexes(collectionOf(RulesModelDef), RULES_INDEXES);
}

module.exports = { RulesModelDef, ConsentModelDef, ConsentHistoryModelDef, RULES_INDEXES, CONSENT_INDEXES, ensureRulesIndexes, ensureConsentIndexes };
