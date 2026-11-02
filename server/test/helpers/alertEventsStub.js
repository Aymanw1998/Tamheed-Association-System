// A no-op stand-in for server/services/alertEvents in vm-loaded controllers,
// so their fire-and-forget alert hooks resolve quietly (no logged error, and
// the real module, which would reach the database, is never loaded).
//   load(file, { ...deps, ...noopAlertDeps })
const noop = async () => ({ created: [] });
const alertEvents = {
  parentRegistered: noop,
  userWaiting: noop,
  accountLocked: noop,
  accessChanged: noop,
  systemLoginFailures: noop,
  vehicleStage: noop,
};

// services/recordAlerts: each forget(kind, id) is kept in `forgotten`.
const forgotten = [];
const recordAlerts = {
  async forget(kind, id) { forgotten.push([kind, String(id)]); },
  async syncVehicle() {},
};

module.exports = {
  forgotten,
  noopAlertDeps: { "../../services/alertEvents": alertEvents, "../../services/recordAlerts": recordAlerts },
};
