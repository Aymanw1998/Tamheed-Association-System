// The one database name every model and script uses (Codex full review,
// 2026-11-18): DB_NAME, or tamheed_db. The older models (users, students,
// lessons, attendance, reports, invite links) used to name tamheed_db
// themselves, so a server with another DB_NAME split its records over two
// databases and the backup (which dumps DB_NAME) missed the core ones.
const DEFAULT_DB_NAME = "tamheed_db";
const DB_NAME = String(process.env.DB_NAME || "").trim() || DEFAULT_DB_NAME;

// Before serving with a DB_NAME other than tamheed_db: when the staff list is
// only in tamheed_db, the core records were written there by the older models,
// and serving now would show an empty system. The server stops and says how
// to move them (countUsers(dbName) answers the number of staff records there).
async function checkDbName(countUsers, { dbName = DB_NAME } = {}) {
  if (dbName === DEFAULT_DB_NAME) return { ok: true };
  const [here, legacy] = await Promise.all([countUsers(dbName), countUsers(DEFAULT_DB_NAME)]);
  if (legacy > 0 && here === 0) {
    return {
      ok: false,
      message: `DB_NAME is "${dbName}", but the staff records are in "${DEFAULT_DB_NAME}" (written there by older versions). ` +
        `Move the data first (mongodump --db=${DEFAULT_DB_NAME} | mongorestore --nsFrom='${DEFAULT_DB_NAME}.*' --nsTo='${dbName}.*'), ` +
        `or set DB_NAME=${DEFAULT_DB_NAME}. See deploy/DEPLOY.md.`,
    };
  }
  return { ok: true };
}

module.exports = { DB_NAME, DEFAULT_DB_NAME, checkDbName };
