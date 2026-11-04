// deploy/update.sh run for real against stand-in commands: at a failure in any
// step it stops at once and says where (owner, 2026-11-04).
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const SCRIPT = path.join(__dirname, "../../deploy/update.sh");

// Every stand-in logs its call, then fails when the call matches FAIL_ON.
const STUB = `#!/usr/bin/env bash
name="$(basename "$0")"
call="$name $*"
echo "$call" >> "$CALLS"
case "$name" in
  sleep) exit 0 ;;
esac
if [ -n "\${FAIL_ON:-}" ] && [[ "$call" == *"$FAIL_ON"* ]]; then echo "stub failed: $call" >&2; exit 3; fi
if [ "$name" = "npm" ] && [ "$1" = "run" ] && [ "$2" = "build" ]; then
  mkdir -p "$4/$BUILD_PATH"
  case "$4" in *"\${NO_INDEX:-none}") ;; *) echo new > "$4/$BUILD_PATH/index.html" ;; esac
fi
if [ "$name" = "pm2" ] && [ "$1" = "describe" ]; then echo "status \${PM2_STATUS:-online}"; fi
exit 0
`;

function runKeeping(env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tamheed-update-"));
  fs.mkdirSync(path.join(dir, "deploy"));
  fs.mkdirSync(path.join(dir, "bin"));
  fs.mkdirSync(path.join(dir, "server/config"), { recursive: true });
  fs.writeFileSync(path.join(dir, "server/config/.env"), "PORT=5055\nIT_HOST=it.example.test\nSPORT_HOST=sport.example.test\nSYSTEM_HOST=system.example.test\n");
  fs.writeFileSync(path.join(dir, "deploy/update.sh"), fs.readFileSync(SCRIPT, "utf8").replace(/\r\n/g, "\n"));
  for (const app of ["system", "sport", "it"]) {
    fs.mkdirSync(path.join(dir, "apps", app, "build"), { recursive: true });
    fs.writeFileSync(path.join(dir, "apps", app, "build/index.html"), "old");
  }
  for (const name of ["git", "npm", "node", "pm2", "curl", "sleep"]) {
    fs.writeFileSync(path.join(dir, "bin", name), STUB, { mode: 0o755 });
  }
  const r = spawnSync("bash", ["-c", 'export PATH="$PWD/bin:$PATH"; export CALLS="$PWD/calls.log"; bash deploy/update.sh'], {
    cwd: dir, encoding: "utf8", env: { ...process.env, TAMHEED_UPDATE_RESTARTED: "", ...env },
  });
  const calls = fs.existsSync(path.join(dir, "calls.log")) ? fs.readFileSync(path.join(dir, "calls.log"), "utf8") : "";
  const sites = {};
  for (const app of ["system", "sport", "it"]) sites[app] = fs.readFileSync(path.join(dir, "apps", app, "build/index.html"), "utf8").trim();
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: r.status, out: r.stdout + r.stderr, calls, sites };
}

const STOPPED = "UPDATE STOPPED";

test("with nothing wrong it finishes, swaps all three and says so", () => {
  const r = runKeeping({});
  assert.equal(r.status, 0, r.out);
  assert.doesNotMatch(r.out, new RegExp(STOPPED));
  assert.deepEqual(r.sites, { system: "new", sport: "new", it: "new" });
  assert.match(r.calls, /pm2 reload/);
});

const BEFORE_SWAP = [
  ["pulling the code", "git pull", "Code"],
  ["server packages", "npm ci --omit=dev", "Server"],
  ["the portrait model", "node server/scripts/fetchPortraitModel", "Server"],
  ["System packages", "npm ci --prefix apps/system", "System"],
  ["the System build", "npm run build --prefix apps/system", "System"],
  ["Sport packages", "npm ci --prefix apps/sport", "Sport"],
  ["the Sport build", "npm run build --prefix apps/sport", "Sport"],
  ["IT packages", "npm ci --prefix apps/it", "IT"],
  ["the IT build", "npm run build --prefix apps/it", "IT"],
];

for (const [label, failOn, part] of BEFORE_SWAP) {
  test(`a failure in ${label} stops everything, names the part and leaves the sites`, () => {
    const r = runKeeping({ FAIL_ON: failOn });
    assert.notEqual(r.status, 0);
    assert.match(r.out, new RegExp(STOPPED));
    assert.match(r.out, new RegExp(`Part: ${part}`));
    assert.match(r.out, new RegExp(failOn));
    assert.match(r.out, new RegExp(`Server: ${os.hostname()}`, "i"));
    assert.match(r.out, /The sites were not changed/);
    assert.deepEqual(r.sites, { system: "old", sport: "old", it: "old" });
    assert.doesNotMatch(r.calls, /pm2 reload/);
  });
}

test("a build that ends without its page stops too", () => {
  const r = runKeeping({ NO_INDEX: "sport" });
  assert.notEqual(r.status, 0);
  assert.match(r.out, /Part: Sport/);
  assert.deepEqual(r.sites, { system: "old", sport: "old", it: "old" });
  assert.doesNotMatch(r.calls, /npm ci --prefix apps\/it/);
});

test("a failed restart stops and says the new builds are already in place", () => {
  const r = runKeeping({ FAIL_ON: "pm2 reload" });
  assert.notEqual(r.status, 0);
  assert.match(r.out, /Part: Server/);
  assert.match(r.out, /new version of the sites is already in place/);
  assert.doesNotMatch(r.calls, /curl/);
});

test("a server that does not stay up stops the update", () => {
  const r = runKeeping({ PM2_STATUS: "errored" });
  assert.notEqual(r.status, 0);
  assert.match(r.out, /Part: Server/);
  assert.match(r.out, /pm2 logs tamheed/);
});

for (const [label, failOn, part] of [
  ["the server's health check", "/api/health", "Server"],
  ["the System site", "system.example.test", "System"],
  ["the Sport site", "sport.example.test", "Sport"],
  ["the IT site", "it.example.test", "IT"],
]) {
  test(`after the restart, ${label} failing names it`, () => {
    const r = runKeeping({ FAIL_ON: failOn });
    assert.notEqual(r.status, 0);
    assert.match(r.out, new RegExp(STOPPED));
    assert.match(r.out, new RegExp(`Part: ${part}`));
  });
}

test("the update is only called done at the very end", () => {
  const r = runKeeping({ FAIL_ON: "it.example.test" });
  assert.doesNotMatch(r.out, /==> Done/);
});
