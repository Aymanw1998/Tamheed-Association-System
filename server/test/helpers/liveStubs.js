// Test helper: stand-ins for the lock guard and live hub requires that the
// write controllers (Student, User, Vehicle, Report) now make. `changes`
// records every notifyChange(entity, id) call (clear it with
// `changes.length = 0`); checkVersion is the real one.
const { checkVersion } = require("../../middleware/lockGuard");

const changes = [];
const notifyChange = (entity, id) => { changes.push([entity, id]); };
const deps = {};
for (const suffix of ["", ".js"]) {
  deps[`../../middleware/lockGuard${suffix}`] = { checkVersion };
  deps[`../../services/liveHub${suffix}`] = { notifyChange };
}

module.exports = { deps, changes };
