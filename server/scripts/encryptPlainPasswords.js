// Finds users whose stored password is neither bcrypt nor "enc." (legacy plain
// text) and re-saves it in the protected format. Plain-text sign-in no longer
// works, so these users cannot log in until this has been applied.
//
//   npm run users:encrypt-plain-passwords            dry run: counts per room only
//   npm run users:encrypt-plain-passwords -- --apply  re-save each affected password
//
// Output never contains ID numbers or password values.
const path = require("path");

const ROOMS = ["active", "waiting", "noActive"];
const BCRYPT_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

function isPlainStoredPassword(value) {
  if (typeof value !== "string" || value === "") return false;
  if (BCRYPT_RE.test(value)) return false;
  const parts = value.split(".");
  if (parts.length === 4 && parts[0] === "enc") return false;
  return true;
}

// Re-saving through model.update runs the model's password transform, which
// encrypts anything not already bcrypt/enc (the same path the app uses).
async function encryptPlainPasswords({ model, apply = false } = {}) {
  const counts = {};
  for (const room of ROOMS) {
    const response = await model.get({}, room);
    const users = response?.success && Array.isArray(response.result) ? response.result : [];
    const plain = users.filter((u) => isPlainStoredPassword(u?.password));
    counts[room] = { found: plain.length, updated: 0 };
    if (!apply) continue;
    for (const user of plain) {
      await model.update({ tz: user.tz }, { password: user.password }, room);
      counts[room].updated += 1;
    }
  }
  return counts;
}

async function main() {
  require("dotenv").config({ path: path.join(__dirname, "..", "config", ".env") });
  const { UserModelDef } = require("../Entities/User/User.model");
  const apply = process.argv.includes("--apply");

  const counts = await encryptPlainPasswords({ model: UserModelDef, apply });
  console.log(apply ? "Applied." : "Dry run (nothing changed). Re-run with --apply to update.");
  for (const room of ROOMS) {
    const { found, updated } = counts[room];
    console.log(`${room}: ${found} plain-text password(s)${apply ? `, ${updated} updated` : ""}`);
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Failed:", err.message);
      process.exit(1);
    });
}

module.exports = { isPlainStoredPassword, encryptPlainPasswords, ROOMS };
