// A copy of the nightly backup outside the server (owner, 2026-11-16):
// encrypted, then uploaded to a private folder on the association's Google
// Drive. If the server is lost, the data is not lost with it.
//
//   node server/scripts/backupOffsite.js upload <archive> [--monthly]
//   node server/scripts/backupOffsite.js decrypt <file.enc> <archive.gz>
//
// The key is BACKUP_ENC_KEY_HEX (64 hex characters) in server/config/.env.
// Keep a copy of it away from the server: without it a copy cannot be read.
// Drive keeps the newest KEEP_DAILY daily copies and KEEP_MONTHLY monthly ones.
// Every upload run records its result for the IT site (OpsStatus "offsite").
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");

const MAGIC = Buffer.from("TMHB1");
const IV_BYTES = 12;
const TAG_BYTES = 16;
const FOLDER = "النسخ الاحتياطية";
const KEEP_DAILY = 7;
const KEEP_MONTHLY = 12;

function keyFrom(hex) {
  if (!/^[0-9a-fA-F]{64}$/.test(String(hex || ""))) {
    throw Object.assign(new Error("BACKUP_ENC_KEY_HEX must be 64 hex characters"), { code: "NO_KEY" });
  }
  return Buffer.from(hex, "hex");
}

// File layout: MAGIC, IV, AES-256-GCM ciphertext, tag.
async function encryptFile(source, target, key) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  await pipeline(
    fs.createReadStream(source),
    cipher,
    async function* frame(encrypted) {
      yield Buffer.concat([MAGIC, iv]);
      for await (const chunk of encrypted) yield chunk;
      yield cipher.getAuthTag();
    },
    fs.createWriteStream(target, { mode: 0o600 }),
  );
}

async function decryptFile(source, target, key) {
  const { size } = await fs.promises.stat(source);
  const head = MAGIC.length + IV_BYTES;
  if (size < head + TAG_BYTES) throw new Error("not a backup copy (too short)");
  const handle = await fs.promises.open(source, "r");
  const header = Buffer.alloc(head);
  const tag = Buffer.alloc(TAG_BYTES);
  try {
    await handle.read(header, 0, head, 0);
    await handle.read(tag, 0, TAG_BYTES, size - TAG_BYTES);
  } finally {
    await handle.close();
  }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("not a backup copy (unknown format)");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, header.subarray(MAGIC.length));
  decipher.setAuthTag(tag);
  await pipeline(fs.createReadStream(source, { start: head, end: size - TAG_BYTES - 1 }), decipher, fs.createWriteStream(target, { mode: 0o600 }));
}

// Which Drive copies to delete: beyond the newest KEEP_DAILY daily and
// KEEP_MONTHLY monthly copies. Names sort by date (tamheed-YYYY-MM-DD-...).
function toDelete(files, { daily = KEEP_DAILY, monthly = KEEP_MONTHLY } = {}) {
  const ours = (files || []).filter((file) => /^tamheed-.*\.enc$/.test(String(file.name || "")));
  const newestFirst = (list) => [...list].sort((a, b) => String(b.name).localeCompare(String(a.name)));
  const monthlies = newestFirst(ours.filter((file) => file.name.includes("-monthly-")));
  const dailies = newestFirst(ours.filter((file) => !file.name.includes("-monthly-")));
  return [...dailies.slice(daily), ...monthlies.slice(monthly)];
}

function copyName(archive, monthly, now = new Date()) {
  const base = path.basename(archive);
  return monthly ? `tamheed-monthly-${now.toISOString().slice(0, 7)}.archive.gz.enc` : `${base}.enc`;
}

async function upload(archive, { monthly = false, drive = require("../services/googleDrive.service"), now = new Date() } = {}) {
  const key = keyFrom(process.env.BACKUP_ENC_KEY_HEX);
  const encrypted = path.join(path.dirname(archive), `.${path.basename(archive)}.enc.partial`);
  try {
    await encryptFile(archive, encrypted, key);
    const name = copyName(archive, monthly, now);
    await drive.uploadPrivateFile({ body: fs.createReadStream(encrypted), name, mimeType: "application/octet-stream", folderPath: FOLDER });
    const old = toDelete(await drive.listChildren(FOLDER));
    for (const file of old) await drive.deleteById(file.id);
    return { name, deleted: old.length };
  } finally {
    await fs.promises.rm(encrypted, { force: true });
  }
}

async function main(argv) {
  require("dotenv").config({ path: path.join(__dirname, "..", "config", ".env") });
  const [mode, a, b] = argv;
  if (mode === "decrypt" && a && b) {
    await decryptFile(a, b, keyFrom(process.env.BACKUP_ENC_KEY_HEX));
    console.log(`decrypted: ${b}`);
    return 0;
  }
  if (mode !== "upload" || !a) {
    console.error("usage: backupOffsite.js upload <archive> [--monthly] | decrypt <file.enc> <archive.gz>");
    return 2;
  }
  const opsStatus = require("../utils/opsStatus");
  try {
    const { name, deleted } = await upload(a, { monthly: argv.includes("--monthly") });
    await opsStatus.record("offsite", true, `${name} (حُذفت ${deleted} نسخ قديمة)`).catch(() => {});
    console.log(`offsite ok: ${name}`);
    return 0;
  } catch (error) {
    const message = error.code === "NO_KEY" ? "BACKUP_ENC_KEY_HEX غير مضبوط في ملف الإعدادات" : String(error.message || error);
    await opsStatus.record("offsite", false, message).catch(() => {});
    console.error(`offsite failed: ${message}`);
    return 1;
  }
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error) => { console.error(error.message); process.exit(1); });
}

module.exports = { encryptFile, decryptFile, toDelete, copyName, keyFrom, upload, main, FOLDER };
