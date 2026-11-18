// Weekly proof that the newest backup can really be restored (owner,
// 2026-11-16). It restores the archive into a separate, temporary database
// (CHECK_DB), checks that the staff accounts came back, and drops it again.
// The live database is never touched. The result is shown on the IT site
// (OpsStatus "restore").
//
//   node server/scripts/restoreCheck.js [backup folder]   (default /var/backups/tamheed)
//
// The app's MongoDB user needs readWrite on CHECK_DB once (deploy/DEPLOY.md).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const CHECK_DB = "tamheed_restore_check";
const MUST_HAVE = "Users";

function newestArchive(dir, names) {
  const archives = (names || []).filter((name) => /^tamheed-\d{4}-\d{2}-\d{2}-\d{6}\.archive\.gz$/.test(name)).sort();
  return archives.length ? path.join(dir, archives[archives.length - 1]) : null;
}

// Pure: is what came back a usable copy?
function judge(counts) {
  const collections = Object.keys(counts || {});
  const total = collections.reduce((sum, name) => sum + Number(counts[name] || 0), 0);
  if (!collections.length) return { ok: false, message: "لم تُسترجع أي مجموعة بيانات" };
  if (!Number(counts[MUST_HAVE])) return { ok: false, message: "حسابات الطاقم (Users) لم تُسترجع" };
  return { ok: true, message: `استُرجعت ${collections.length} مجموعة و${total} سجلًا` };
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}: ${err.trim().slice(-200)}`))));
  });
}

async function check(dir) {
  const archive = newestArchive(dir, await fs.promises.readdir(dir));
  if (!archive) return { ok: false, message: `لا توجد نسخة احتياطية في ${dir}` };
  const db = process.env.DB_NAME || "tamheed_db";
  const uri = process.env.MONGO_URI;
  if (!uri) return { ok: false, message: "MONGO_URI غير مضبوط" };

  const configFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tamheed-restore-")), "config.yaml");
  fs.writeFileSync(configFile, `uri: '${uri.replace(/'/g, "''")}'\n`, { mode: 0o600 });
  const mongoose = require("mongoose");
  try {
    await run("mongorestore", [`--config=${configFile}`, "--gzip", `--archive=${archive}`,
      `--nsFrom=${db}.*`, `--nsTo=${CHECK_DB}.*`, "--drop", "--quiet"]);
    if (mongoose.connection.readyState !== 1) await mongoose.connect(uri);
    const restored = mongoose.connection.useDb(CHECK_DB, { useCache: false });
    const counts = {};
    for (const { name } of await restored.db.listCollections().toArray()) {
      counts[name] = await restored.db.collection(name).estimatedDocumentCount();
    }
    const verdict = judge(counts);
    return { ...verdict, message: `${verdict.message} (${path.basename(archive)})` };
  } finally {
    try {
      // Collection by collection: readWrite may drop collections, not the
      // database; a database left with none is gone.
      if (mongoose.connection.readyState === 1) {
        const restored = mongoose.connection.useDb(CHECK_DB, { useCache: false });
        for (const { name } of await restored.db.listCollections().toArray()) await restored.db.dropCollection(name);
      }
    } catch (error) {
      console.error(`could not drop ${CHECK_DB}: ${error.message}`);
    }
    fs.rmSync(path.dirname(configFile), { recursive: true, force: true });
  }
}

async function main(argv) {
  require("dotenv").config({ path: path.join(__dirname, "..", "config", ".env") });
  const opsStatus = require("../utils/opsStatus");
  let result;
  try {
    result = await check(argv[0] || "/var/backups/tamheed");
  } catch (error) {
    result = { ok: false, message: String(error.message || error) };
  }
  await opsStatus.record("restore", result.ok, result.message).catch((error) => console.error(error.message));
  console.log(`restore check ${result.ok ? "ok" : "FAILED"}: ${result.message}`);
  await require("mongoose").disconnect().catch(() => {});
  return result.ok ? 0 : 1;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code)).catch((error) => { console.error(error.message); process.exit(1); });
}

module.exports = { CHECK_DB, newestArchive, judge, main };
