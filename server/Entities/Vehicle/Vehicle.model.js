const api = require("../api");

// One document per vehicle or trailer. Licences, tests, insurance policies and
// documents are arrays inside it and are only ever appended to or marked
// (voided / cancelled / superseded), so earlier renewals and inspections stay.
//
// Shape (dates are "YYYY-MM-DD" text, the plate is stored normalised as text):
//   plate, plateKey, nickname, type ("vehicle"|"trailer"), classification,
//   make, model, year, color, chassisNumber, registeredOwner,
//   responsibleId, status ("active"|"out_of_service"|"archived"), notes,
//   trailer: { selfWeightKg, grossWeightKg, payloadKg, brakes, towingConditions },
//   licenses[], tests[], nextTestDate, policies[], documents[],
//   createdBy, createdAt, updatedBy, updatedAt, archivedAt, archivedBy
const VehicleModelDef = {
  dbName: process.env.DB_NAME || "tamheed_db",
  collections: { active: "Vehicles", audit: "VehicleAudit" },
};

VehicleModelDef.get = async function (filter = {}) {
  return await api.read({ dbName: this.dbName, collection: this.collections.active, filter });
};

VehicleModelDef.create = async function (data) {
  return await api.create({ dbName: this.dbName, collection: this.collections.active, data });
};

// api.update upserts, so callers must have loaded the vehicle first.
VehicleModelDef.update = async function (filter, newData) {
  return await api.update({ dbName: this.dbName, collection: this.collections.active, filter, newData });
};

VehicleModelDef.delete = async function (filter) {
  return await api.delete({ dbName: this.dbName, collection: this.collections.active, filter });
};

const VehicleAuditDef = {
  dbName: VehicleModelDef.dbName,
  collection: VehicleModelDef.collections.audit,
};

VehicleAuditDef.get = async function (filter = {}) {
  return await api.read({ dbName: this.dbName, collection: this.collection, filter });
};

VehicleAuditDef.create = async function (data) {
  return await api.create({ dbName: this.dbName, collection: this.collection, data });
};

VehicleAuditDef.delete = async function (filter) {
  return await api.delete({ dbName: this.dbName, collection: this.collection, filter });
};

module.exports = { VehicleModelDef, VehicleAuditDef };
