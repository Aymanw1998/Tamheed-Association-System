// Stand-in for server/utils/audit.js in vm-loaded controllers: records every
// audit.record(req, entry) call instead of writing to the database.
// Usage: const audit = auditStub(); load(file, { ...deps, ...audit.deps });
//        audit.calls -> [{ req, module, action, targetType, targetId, targetLabel, before, after }]
function auditStub() {
  const calls = [];
  const exportsObject = {
    audit: {
      async record(req, entry = {}) {
        // JSON round-trip: objects built inside a vm context have foreign prototypes.
        const plain = JSON.parse(JSON.stringify({ ...entry, before: entry.before ?? null, after: entry.after ?? null }));
        calls.push({ req, ...plain });
      },
    },
  };
  const deps = {
    "../../utils/audit": exportsObject,
    "../../utils/audit.js": exportsObject,
  };
  const find = (match) => calls.filter((c) => Object.entries(match).every(([k, v]) => String(c[k]) === String(v)));
  return { calls, deps, find };
}

module.exports = { auditStub };
