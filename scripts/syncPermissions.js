const fs = require("node:fs");
const path = require("node:path");

const CLIENTS = ["system", "it"];

// CRA bundles imports inside src only. These JSON copies are build artifacts;
// shared/permissions.json is the only editable definition, also read by Node.
function syncPermissions({ root = path.resolve(__dirname, ".."), check = false } = {}) {
  const source = fs.readFileSync(path.join(root, "shared/permissions.json"), "utf8");
  const catalog = JSON.parse(source);
  const keys = Object.entries(catalog.tree).flatMap(([module, leaves]) => leaves.map((leaf) => `${module}.${leaf}`));
  for (const key of catalog.itKeys) if (!keys.includes(key)) throw new Error(`Unknown IT permission: ${key}`);
  for (const [module, leaves] of Object.entries(catalog.tree)) {
    if (!catalog.labels.ar.modules[module]) throw new Error(`Missing permission module label: ${module}`);
    for (const leaf of leaves) {
      if (!catalog.labels.ar.leavesByModule[module]?.[leaf] && !catalog.labels.ar.leaves[leaf]) {
        throw new Error(`Missing permission label: ${module}.${leaf}`);
      }
    }
  }
  const output = `${JSON.stringify(catalog, null, 2)}\n`;
  for (const client of CLIENTS) {
    const target = path.join(root, "apps", client, "src", "generated", "permissions.json");
    const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n") : "";
    if (current === output) continue;
    if (check) throw new Error(`Stale permission catalog: ${client}; run node scripts/syncPermissions.js`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, output);
  }
}

if (require.main === module) syncPermissions({ check: process.argv.includes("--check") });
module.exports = { syncPermissions };
