// Test helper: stand-ins for the lock guard and live hub requires that the
// write controllers and routes make. `changes` records every
// notifyChange(entity, id) call (clear it with `changes.length = 0`);
// `students` records every liveHub.toStudents(ids, type) call as
// [[ids as strings], type]. checkVersion is the real one; route lock checks
// pass (the guard itself is tested in lock-guard.test.js).
const { checkVersion, editorStamp } = require("../../middleware/lockGuard");

const changes = [];
const students = [];
const notifyChange = (entity, id) => { changes.push([entity, id]); };
const liveHub = { toStudents: (ids, type) => { students.push([Array.from(ids || [], String), type]); } };
const requireFreeOrMine = () => (req, res, next) => next();
const deps = {};
for (const suffix of ["", ".js"]) {
  deps[`../../middleware/lockGuard${suffix}`] = { checkVersion, editorStamp, requireFreeOrMine };
  deps[`../../services/liveHub${suffix}`] = { notifyChange, liveHub };
}

module.exports = { deps, changes, students };
