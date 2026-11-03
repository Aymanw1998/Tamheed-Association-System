// Lists ID numbers held by more than one record in the same collection:
// "node scripts/findDuplicateTz.js". The unique tz index (utils/tzUnique) is
// not created while any exist; fix them by hand, then restart the server.
// Read-only: nothing is changed.
const path = require("path");

// rows: [{ collection, docs }] -> [{ collection, tz, count }]
function findDuplicateTz(rows) {
  const found = [];
  for (const { collection, docs } of rows) {
    const counts = new Map();
    for (const doc of docs) {
      if (typeof doc?.tz !== "string" || doc.tz === "") continue; // outside the index
      counts.set(doc.tz, (counts.get(doc.tz) || 0) + 1);
    }
    for (const [tz, count] of counts) if (count > 1) found.push({ collection, tz, count });
  }
  return found;
}

async function main() {
  require("dotenv").config({ path: path.join(__dirname, "..", "config", ".env") });
  const { UserModelDef } = require("../Entities/User/User.model");
  const { StudentModelDef } = require("../Entities/Student/Student.model");

  const rows = [{ collection: StudentModelDef.collections.active, docs: (await StudentModelDef.get({})).result || [] }];
  for (const [room, collection] of Object.entries(UserModelDef.collections)) {
    rows.push({ collection, docs: (await UserModelDef.get({}, room)).result || [] });
  }
  const found = findDuplicateTz(rows);
  if (!found.length) {
    console.log("No duplicate ID numbers. The unique index can be created.");
    return 0;
  }
  for (const { collection, tz, count } of found) console.log(`${collection}: ${tz} x${count}`);
  return 1;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error("Failed to look for duplicates:", err.message);
      process.exit(1);
    });
}

module.exports = { findDuplicateTz };
