// Manual unlock: "npm run user:unlock -- <tz>".
// Clears the failed-login counter and the lock for one user, in whichever room
// the account lives. Exits non-zero when no such user exists.
const path = require("path");

const ROOMS = ["active", "waiting", "noActive"];

async function unlockUser(tz, model) {
  const id = String(tz ?? "").trim();
  if (!id) return { found: false };

  for (const room of ROOMS) {
    const response = await model.get({ tz: id }, room);
    if (response?.success && Array.isArray(response.result) && response.result.length > 0) {
      await model.update({ tz: id }, { failedLoginCount: 0, lockedAt: null }, room);
      return { found: true, room };
    }
  }
  return { found: false };
}

async function main() {
  require("dotenv").config({ path: path.join(__dirname, "..", "config", ".env") });
  const { UserModelDef } = require("../Entities/User/User.model");

  const result = await unlockUser(process.argv[2], UserModelDef);
  if (!result.found) {
    console.error("No user found with that ID number. Nothing was changed.");
    return 1;
  }
  console.log(`Account unlocked (room: ${result.room}). Failed-login counter reset to 0.`);
  return 0;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error("Failed to unlock user:", err.message);
      process.exit(1);
    });
}

module.exports = { unlockUser, ROOMS };
