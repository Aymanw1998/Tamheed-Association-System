const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", "config", ".env") });

const mongoose = require("mongoose");

// Empties EVERY collection in the app database (users, students, lessons,
// attendance, reports, vehicles, notices, storage metadata, integrations...).
// Collections and their indexes are kept; only documents are removed.
// Files stored in Google Drive are NOT touched.
// The system administrator is recreated from SYSTEM_ADMIN_* on the next server start.
const DB_NAME = process.env.DB_NAME || "tamheed_db";
const hasForceFlag = process.argv.includes("--force");

const main = async () => {
  if (!hasForceFlag) {
    console.error("Refusing to delete data without --force");
    console.error("Usage: node scripts/clearAllData.js --force");
    process.exit(1);
  }

  // Same resolver override as config/db.js, for mongodb+srv:// lookups.
  const dnsServers = (process.env.DNS_SERVERS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (dnsServers.length) require("dns").setServers(dnsServers);

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.useDb(DB_NAME, { useCache: true }).db;
  const collections = await db.listCollections().toArray();

  const results = [];
  for (const { name } of collections) {
    if (name.startsWith("system.")) continue;
    try {
      const before = await db.collection(name).countDocuments();
      const { deletedCount } = await db.collection(name).deleteMany({});
      results.push({ collection: name, before, deletedCount, ok: true });
    } catch (error) {
      results.push({ collection: name, before: "unknown", deletedCount: 0, ok: false, error: error?.message || "Delete failed" });
    }
  }

  console.log(`Clear finished for database "${DB_NAME}".`);
  console.table(results);
  await mongoose.disconnect();

  const failed = results.filter((row) => !row.ok);
  process.exit(failed.length ? 1 : 0);
};

main().catch((error) => {
  console.error("Failed to clear data:", error);
  process.exit(1);
});
