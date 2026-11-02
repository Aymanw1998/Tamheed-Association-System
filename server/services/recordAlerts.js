// Alerts that belong to a record (owner, 2026-11-02):
//   forget(kind, id)      a deleted vehicle, student, lesson or user takes its
//                         alerts with it (every recipient's inbox; a vehicle's
//                         board notices too; a user's own inbox)
//   syncVehicle(vehicle)  after a vehicle is saved: only the alerts of its
//                         current licence/test/insurance stages stay, so a
//                         renewal (or archiving) removes the old ones at once
//   pruneVehicles(keys)   the nightly check: every vehicle alert or notice whose
//                         key is not current goes (renewed, superseded, or its
//                         vehicle archived or gone)
// The stores are AlertModelDef and NoticeModelDef; injectable for tests.
const rules = require("../utils/vehicleRules");
const { dedupKeyFor } = require("../utils/vehicleNotices");
const { recordPrefixes } = require("./alertRetention");

function createRecordAlerts({ alerts, notices, today = () => rules.todayInJerusalem() } = {}) {
  const stores = () => ({
    alerts: alerts || require("../Entities/Alert/Alert.model").AlertModelDef,
    notices: notices || require("../Entities/Notice/Notice.model").NoticeModelDef,
  });

  async function forget(kind, id) {
    const prefixes = recordPrefixes(kind, id);
    if (!prefixes.length) return;
    const s = stores();
    await s.alerts.removeByPrefixes(prefixes);
    if (kind === "vehicle") await s.notices.removeByPrefixes(prefixes);
    if (kind === "user") await s.alerts.removeForRecipient(String(id));
  }

  async function syncVehicle(vehicle = {}) {
    const id = String(vehicle?._id ?? "").trim();
    if (!id) return;
    const keep = rules.buildAlerts(vehicle, today()).map(dedupKeyFor);
    const s = stores();
    await s.alerts.removeExcept(`vehicle:${id}:`, keep);
    await s.notices.removeExcept(`vehicle:${id}:`, keep);
  }

  async function pruneVehicles(keepKeys) {
    const keep = [...keepKeys];
    const s = stores();
    await s.alerts.removeExcept("vehicle:", keep);
    await s.notices.removeExcept("vehicle:", keep);
  }

  return { forget, syncVehicle, pruneVehicles };
}

const records = createRecordAlerts();

module.exports = { ...records, createRecordAlerts };
