// Stand-in for services/recycleBin.js in vm-loaded controllers: records every
// put/drop instead of writing to the database (owner, 2026-11-16).
// Usage: const bin = recycleBinStub(); load(file, { ...deps, ...bin.deps });
//        bin.puts -> [{ kind, refId, label, data, extras }]
function recycleBinStub() {
  const puts = [];
  const drops = [];
  const recycleBin = {
    async put(kind, entry) {
      puts.push(JSON.parse(JSON.stringify({ kind, ...entry, actor: undefined })));
      return `trash-${puts.length}`;
    },
    async drop(id) { drops.push(id); },
  };
  return { puts, drops, deps: { "../../services/recycleBin": { recycleBin } } };
}

module.exports = { recycleBinStub };
