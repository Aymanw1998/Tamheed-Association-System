const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", "config", ".env") });

const api = require("../Entities/api");

const DB_NAME = "tamheed_db";
const hasForceFlag = process.argv.includes("--force");

const COLLECTIONS = [
  "Users",
  "UsersWaitingRoom",
  "UsersNoActive",
  "Students",
  "Lessons",
  "Reports",
  "Attendances",
  "InviteToken",
];

const main = async () => {
  if (!hasForceFlag) {
    console.error("Refusing to delete data without --force");
    console.error("Usage: node scripts/clearAllData.js --force");
    process.exit(1);
  }

  const results = [];

  for (const collection of COLLECTIONS) {
    try {
      const before = await api.read({
        dbName: DB_NAME,
        collection,
        filter: {},
      });

      const countBefore = Array.isArray(before?.result) ? before.result.length : 0;

      const deleted = await api.delete({
        dbName: DB_NAME,
        collection,
        filter: {},
      });

      results.push({
        collection,
        before: countBefore,
        ok: !!deleted?.success,
        deletedCount: deleted?.deletedCount ?? deleted?.count ?? countBefore,
      });
    } catch (error) {
      results.push({
        collection,
        before: "unknown",
        ok: false,
        deletedCount: 0,
        error: error?.error || error?.message || "Delete failed",
      });
    }
  }

  console.log(`Clear finished for database "${DB_NAME}" via external data API.`);
  console.table(results);

  const failed = results.filter((row) => !row.ok);
  process.exit(failed.length ? 1 : 0);
};

main().catch((error) => {
  console.error("Failed to clear data:", error);
  process.exit(1);
});
