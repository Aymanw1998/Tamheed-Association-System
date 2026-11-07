// Operator maintenance tool, never imported or executed by the application.
// Preview by default; --apply moves existing folders with their original ids.
async function main(args = process.argv.slice(2)) {
  if (args.some((arg) => !["--apply", "--dry-run"].includes(arg)) || (args.includes("--apply") && args.includes("--dry-run"))) {
    throw new Error("Usage: node scripts/reorganizeDrive.js [--dry-run | --apply]");
  }
  const path = require("path");
  require("dotenv").config({ path: path.resolve(__dirname, "../config/.env"), quiet: true });
  const mongoose = require("mongoose");
  try {
    const result = await require("../services/googleDrive.service").reorganizeLayout({ apply: args.includes("--apply") });
    // Folder structure only, no file names, account email, tokens or records.
    const { moves, ...summary } = result;
    process.stdout.write(JSON.stringify({ ...summary, moves: moves.map(({ from, to }) => ({ from, to })) }, null, 2) + "\n");
  } finally { await mongoose.disconnect(); }
}
if (require.main === module) main().catch((error) => { process.stderr.write(`${error.code || "DRIVE_LAYOUT_ERROR"}: ${error.message}\n`); process.exitCode = 1; });
module.exports = { main };
