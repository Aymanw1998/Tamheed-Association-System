// Records the result of a server check for the IT site (owner, 2026-11-16).
// Called by deploy/mongo-backup.sh and the other cron scripts:
//   node server/scripts/opsReport.js <backup|offsite|restore> <ok|failed> [message]
// Never fails the caller's job: a problem here is printed and exits 0.
const path = require("path");

async function main(argv) {
  require("dotenv").config({ path: path.join(__dirname, "..", "config", ".env") });
  const [check, result, ...words] = argv;
  if (!check || !["ok", "failed"].includes(result)) {
    console.error("usage: node server/scripts/opsReport.js <check> <ok|failed> [message]");
    return 0;
  }
  try {
    await require("../utils/opsStatus").record(check, result === "ok", words.join(" "));
  } catch (error) {
    console.error(`Could not record ${check}: ${error.message}`);
  }
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error) => { console.error(error.message); process.exit(0); });
}

module.exports = { main };
