// CLI entry point for "npm run data:admin".
// Loads env vars and (re)creates/normalizes the system admin user defined by
// SYSTEM_ADMIN_* in config/.env. The same bootstrap also runs automatically
// on every server start (see server.js), this script just lets you trigger
// it on demand without starting the whole server.
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, "..", "config", ".env") });

const { ensureSystemAdmin } = require("./ensureSystemAdmin");

ensureSystemAdmin()
  .then((result) => {
    console.log("ensureSystemAdmin result:", result);
    process.exit(result?.ok ? 0 : 1);
  })
  .catch((err) => {
    console.error("Failed to ensure system admin:", err);
    process.exit(1);
  });
