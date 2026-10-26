// Test helper: an in-memory stand-in for an api.js model definition. `get`
// understands the small subset of MongoDB filters the code under test uses:
// equality (values compared as strings), dotted paths, $in, $ne, $gte, $lte,
// $gt, $lt.
const pathValue = (doc, path) => path.split(".").reduce((v, k) => (v == null ? undefined : v[k]), doc);
// Dates compare to the millisecond, like MongoDB (String() would drop the milliseconds).
const stamp = (v) => (v instanceof Date ? v.toISOString() : String(v));
const same = (a, b) => (a == null || b == null ? a == b : stamp(a) === stamp(b)); // eslint-disable-line eqeqeq

function matchesCondition(value, cond) {
  if (cond && typeof cond === "object" && !Array.isArray(cond) && !(cond instanceof Date)) {
    return Object.entries(cond).every(([op, arg]) => {
      switch (op) {
        case "$in": return (Array.isArray(value) ? value : [value]).some((v) => arg.some((a) => same(v, a)));
        case "$ne": return !same(value, arg);
        case "$gte": return value != null && value >= arg;
        case "$lte": return value != null && value <= arg;
        case "$gt": return value != null && value > arg;
        case "$lt": return value != null && value < arg;
        default: throw new Error(`memoryModel: unsupported operator ${op}`);
      }
    });
  }
  if (Array.isArray(value)) return value.some((v) => same(v, cond));
  return same(value, cond);
}

const matches = (doc, filter = {}) =>
  Object.entries(filter).every(([path, cond]) => matchesCondition(pathValue(doc, path), cond));

// rooms: { active: [...], waiting: [...] } for users; a plain array otherwise.
function memoryModel(rows) {
  const rooms = Array.isArray(rows) ? { active: rows } : rows;
  return {
    calls: [],
    async get(filter = {}, room = "active") {
      this.calls.push({ filter, room });
      const docs = (rooms[room] || []).filter((d) => matches(d, filter)).map((d) => ({ ...d }));
      return { success: true, result: docs };
    },
  };
}

module.exports = { memoryModel, matches };
