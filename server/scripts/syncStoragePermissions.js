const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../config/.env") });
dotenv.config();

const { UserModelDef } = require("../Entities/User/User.model");
const { syncStorageViewPermissionsForUser } = require("../Entities/Storage/Storage.controller");

const USER_FILTER_TZ = String(
  process.argv.find((arg) => arg.startsWith("--tz="))?.slice(5) || ""
).trim();

async function main() {
  const response = await UserModelDef.get({}, "active");
  const users = response?.success && Array.isArray(response.result) ? response.result : [];
  const scopedUsers = USER_FILTER_TZ
    ? users.filter((user) => String(user?.tz || "").trim() === USER_FILTER_TZ)
    : users;

  console.log(`Syncing storagePermissions for ${scopedUsers.length} active users...`);

  let synced = 0;
  let failed = 0;

  for (const user of scopedUsers) {
    const label = `${user.firstname || ""} ${user.lastname || ""}`.trim() || user.tz || user._id;

    try {
      const nextPermissions = await syncStorageViewPermissionsForUser(user);
      console.log(
        `OK ${user.tz}: ${label} -> view=${Array.isArray(nextPermissions?.view) ? nextPermissions.view.length : 0}`
      );
      synced += 1;
    } catch (error) {
      console.error(`FAIL ${user.tz}: ${label} -> ${error?.message || error}`);
      failed += 1;
    }
  }

  console.log(`Done. Synced: ${synced}, Failed: ${failed}`);
}

main().catch((error) => {
  console.error("storagePermissions sync failed:", error?.message || error);
  process.exitCode = 1;
});
