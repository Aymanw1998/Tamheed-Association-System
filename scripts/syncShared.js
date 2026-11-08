const fs = require("node:fs");
const path = require("node:path");
const { syncPermissions } = require("./syncPermissions");
function syncShared({ root = path.resolve(__dirname, ".."), check = false } = {}) {
  syncPermissions({ root, check });
  const source = fs.readFileSync(path.join(root, "shared/dateFormat.js"), "utf8").replace(/\r\n/g, "\n").replace("module.exports =", "export");
  for (const app of ["system", "it", "sport"]) {
    const target = path.join(root, "apps", app, "src/generated/dateFormat.js");
    const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n") : "";
    if (current === source) continue;
    if (check) throw new Error(`Stale shared date formatter: ${app}`);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, source);
  }
  syncTokens({ root, check });
}
// One set of design tokens (colors, spacing, motion, the dark theme) for
// the everyday app and IT; Sport keeps its own stadium palette.
function syncTokens({ root, check }) {
  const source = fs.readFileSync(path.join(root, "shared/tokens.css"), "utf8").replace(/\r\n/g, "\n");
  for (const app of ["system", "it"]) {
    const target = path.join(root, "apps", app, "src/generated/tokens.css");
    const current = fs.existsSync(target) ? fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n") : "";
    if (current === source) continue;
    if (check) throw new Error(`Stale shared design tokens: ${app}`);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, source);
  }
}
if (require.main === module) syncShared({ check: process.argv.includes("--check") });
module.exports = { syncShared };
