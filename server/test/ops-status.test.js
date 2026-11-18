// The server's own checks shown on the IT site, and the backup copy helpers
// (owner, 2026-11-16).
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { evaluate, CHECKS } = require("../utils/opsStatus");
const { describe: describeDisk, createDiskCheck, MIN_FREE_RATIO } = require("../services/diskCheckJob");
const { encryptFile, decryptFile, toDelete, copyName, keyFrom } = require("../scripts/backupOffsite");
const { newestArchive, judge } = require("../scripts/restoreCheck");

const NOW = new Date("2026-11-16T10:00:00Z");
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600 * 1000);

test("every known check is listed; missing, stale and failed ones are not ok", () => {
  const rows = [
    { check: "backup", ok: true, at: hoursAgo(5), message: "tamheed-x (1M)" },
    { check: "offsite", ok: false, at: hoursAgo(5), message: "no key" },
    { check: "disk", ok: true, at: hoursAgo(4) },
  ];
  const out = evaluate(rows, NOW);
  assert.deepEqual(out.map((c) => c.id), Object.keys(CHECKS));
  const byId = Object.fromEntries(out.map((c) => [c.id, c]));
  assert.equal(byId.backup.state, "ok");
  assert.equal(byId.backup.ok, true);
  assert.equal(byId.offsite.state, "failed");
  assert.equal(byId.offsite.message, "no key");
  assert.equal(byId.restore.state, "missing");
  assert.equal(byId.disk.state, "stale", "disk is checked hourly; 4 hours without a row is stale");
});

test("a backup that stopped running turns stale after 36 hours", () => {
  assert.equal(evaluate([{ check: "backup", ok: true, at: hoursAgo(35) }], NOW)[0].state, "ok");
  assert.equal(evaluate([{ check: "backup", ok: true, at: hoursAgo(37) }], NOW)[0].state, "stale");
  const restore = (h) => evaluate([{ check: "restore", ok: true, at: hoursAgo(h) }], NOW).find((c) => c.id === "restore").state;
  assert.equal(restore(7 * 24), "ok");
  assert.equal(restore(9 * 24), "stale");
});

test("the disk check fails below 15% free and records what it saw", async () => {
  const stats = (freeRatio) => ({ blocks: 1000, bsize: 1024 ** 2, bavail: Math.round(1000 * freeRatio) });
  assert.equal(MIN_FREE_RATIO, 0.15);
  assert.equal(describeDisk(stats(0.4)).ok, true);
  assert.equal(describeDisk(stats(0.1)).ok, false);
  assert.match(describeDisk(stats(0.1)).message, /10%/);

  const recorded = [];
  const check = createDiskCheck({ statfs: async () => stats(0.05), record: async (...args) => recorded.push(args) });
  await check();
  assert.equal(recorded[0][0], "disk");
  assert.equal(recorded[0][1], false);

  const quiet = createDiskCheck({ statfs: async () => { throw new Error("no statfs"); }, record: async () => assert.fail(), log: () => {} });
  assert.equal(await quiet(), null);
});

test("a backup copy is encrypted and comes back byte for byte; a wrong key or a changed byte is refused", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tamheed-offsite-"));
  try {
    const key = crypto.randomBytes(32);
    const source = path.join(dir, "a.archive.gz");
    const data = crypto.randomBytes(200000);
    fs.writeFileSync(source, data);
    await encryptFile(source, path.join(dir, "a.enc"), key);
    const encrypted = fs.readFileSync(path.join(dir, "a.enc"));
    assert.ok(!encrypted.includes(data.subarray(0, 64)), "the plain data is not in the copy");
    await decryptFile(path.join(dir, "a.enc"), path.join(dir, "back.gz"), key);
    assert.ok(fs.readFileSync(path.join(dir, "back.gz")).equals(data));

    await assert.rejects(decryptFile(path.join(dir, "a.enc"), path.join(dir, "x.gz"), crypto.randomBytes(32)));
    encrypted[100] ^= 1;
    fs.writeFileSync(path.join(dir, "bad.enc"), encrypted);
    await assert.rejects(decryptFile(path.join(dir, "bad.enc"), path.join(dir, "y.gz"), key));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the key must be 64 hex characters", () => {
  assert.throws(() => keyFrom(""), { code: "NO_KEY" });
  assert.throws(() => keyFrom("ab"), { code: "NO_KEY" });
  assert.equal(keyFrom("a".repeat(64)).length, 32);
});

test("Drive keeps the newest 7 daily and 12 monthly copies, and nothing else of ours is touched", () => {
  const daily = Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, name: `tamheed-2026-11-${String(i + 1).padStart(2, "0")}-023000.archive.gz.enc` }));
  const monthly = Array.from({ length: 14 }, (_, i) => ({ id: `m${i}`, name: `tamheed-monthly-20${25 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}.archive.gz.enc` }));
  const other = [{ id: "o1", name: "notes.txt" }];
  const gone = toDelete([...daily, ...monthly, ...other]).map((f) => f.id).sort();
  assert.deepEqual(gone, ["d0", "d1", "d2", "m0", "m1"].sort());
  assert.equal(copyName("/b/tamheed-2026-11-16-023000.archive.gz", false), "tamheed-2026-11-16-023000.archive.gz.enc");
  assert.equal(copyName("/b/x.archive.gz", true, NOW), "tamheed-monthly-2026-11.archive.gz.enc");
});

test("the restore check takes the newest nightly archive and needs the staff accounts back", () => {
  assert.equal(newestArchive("/b", ["tamheed-2026-11-14-023000.archive.gz", "tamheed-2026-11-15-023000.archive.gz", ".partial", "monthly"]),
    path.join("/b", "tamheed-2026-11-15-023000.archive.gz"));
  assert.equal(newestArchive("/b", []), null);
  assert.equal(judge({}).ok, false);
  assert.equal(judge({ Students: 40 }).ok, false);
  const good = judge({ Users: 12, Students: 300 });
  assert.equal(good.ok, true);
  assert.match(good.message, /312/);
});
