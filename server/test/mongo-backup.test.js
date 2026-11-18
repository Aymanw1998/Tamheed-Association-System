// deploy/mongo-backup.sh run for real against stand-in commands (owner,
// 2026-11-16): the result reaches the IT site, the first backup of a month is
// kept for a year, and every backup is copied to Google Drive.
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const DEPLOY = path.join(__dirname, "../../deploy");

// Every stand-in logs its call. mongodump writes the archive it is asked for;
// node runs inline scripts (-e) for real and only logs the project's scripts.
const STUB = `#!/usr/bin/env bash
name="$(basename "$0")"
if [ "$name" = node ] && [ "$1" = "-e" ]; then exec "$REAL_NODE" "$@"; fi
echo "$name $*" >> "$CALLS"
if [ "$name" = mongodump ]; then
  [ -n "\${DUMP_FAILS:-}" ] && exit 3
  for arg in "$@"; do case "$arg" in --archive=*) echo data > "\${arg#--archive=}" ;; esac; done
fi
exit 0
`;

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tamheed-backup-"));
  for (const sub of ["deploy", "bin", "server/config", "backups"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  for (const file of ["mongo-backup.sh", "env-get.sh"]) {
    fs.writeFileSync(path.join(dir, "deploy", file), fs.readFileSync(path.join(DEPLOY, file), "utf8").replace(/\r\n/g, "\n"));
  }
  fs.writeFileSync(path.join(dir, "server/config/.env"), "MONGO_URI=mongodb://app:secret@127.0.0.1:27017/tamheed_db\n");
  for (const name of ["mongodump", "node", "flock", "pm2"]) fs.writeFileSync(path.join(dir, "bin", name), STUB, { mode: 0o755 });
  return dir;
}

function run(dir, env = {}) {
  const r = spawnSync("bash", ["-c", 'export PATH="$PWD/bin:$PATH"; bash deploy/mongo-backup.sh'], {
    cwd: dir, encoding: "utf8",
    env: { ...process.env, CALLS: path.join(dir, "calls.log"), REAL_NODE: process.execPath, BACKUP_DIR: path.join(dir, "backups"), STOP_APP: "no", ...env },
  });
  const calls = fs.existsSync(path.join(dir, "calls.log")) ? fs.readFileSync(path.join(dir, "calls.log"), "utf8") : "";
  fs.rmSync(path.join(dir, "calls.log"), { force: true });
  return { status: r.status, out: r.stdout + r.stderr, calls };
}

test("a good backup reports ok, keeps the month's first copy and sends it to Drive as monthly", () => {
  const dir = setup();
  try {
    const r = run(dir);
    assert.equal(r.status, 0, r.out);
    assert.match(r.calls, /node server\/scripts\/opsReport\.js backup ok tamheed-/);
    assert.match(r.calls, /node server\/scripts\/backupOffsite\.js upload .*tamheed-.*\.archive\.gz --monthly/);
    const monthly = fs.readdirSync(path.join(dir, "backups/monthly"));
    assert.equal(monthly.length, 1);
    assert.match(monthly[0], /^tamheed-\d{4}-\d{2}\.archive\.gz$/);

    // The next backup that month: an ordinary copy.
    const again = run(dir);
    assert.equal(again.status, 0, again.out);
    assert.match(again.calls, /backupOffsite\.js upload .*\.archive\.gz\n/);
    assert.doesNotMatch(again.calls, /--monthly/);
    assert.equal(fs.readdirSync(path.join(dir, "backups/monthly")).length, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a failed dump reports failed and sends nothing to Drive", () => {
  const dir = setup();
  try {
    const r = run(dir, { DUMP_FAILS: "1" });
    assert.notEqual(r.status, 0);
    assert.match(r.calls, /opsReport\.js backup failed the backup did not finish/);
    assert.doesNotMatch(r.calls, /backupOffsite/);
    assert.doesNotMatch(r.calls, /opsReport\.js backup ok/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("OFFSITE=no keeps the backup on the server only", () => {
  const dir = setup();
  try {
    const r = run(dir, { OFFSITE: "no" });
    assert.equal(r.status, 0, r.out);
    assert.match(r.calls, /opsReport\.js backup ok/);
    assert.doesNotMatch(r.calls, /backupOffsite/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Codex full review, 2026-11-18: the backup waits for an update (they share
// deploy/.maintenance.lock) and dumps only while holding it.
test("the backup takes the maintenance lock before it stops the app or dumps", () => {
  const dir = setup();
  try {
    const r = run(dir);
    assert.equal(r.status, 0, r.out);
    const lines = r.calls.split("\n");
    const lock = lines.findIndex((l) => l.startsWith("flock -w"));
    const dump = lines.findIndex((l) => l.startsWith("mongodump"));
    assert.ok(lock >= 0 && lock < dump, r.calls);
    assert.ok(fs.existsSync(path.join(dir, "deploy/.maintenance.lock")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
