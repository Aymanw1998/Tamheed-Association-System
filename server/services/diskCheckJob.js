// Free disk space on the server, checked every hour and shown on the IT site
// (owner, 2026-11-16). A full disk stops the backup, MongoDB and the update;
// below MIN_FREE_RATIO free the check fails, early enough to act.
const fs = require("fs");
const opsStatus = require("../utils/opsStatus");

const MIN_FREE_RATIO = 0.15;
const EVERY_MS = 60 * 60 * 1000;

function describe(stats) {
  const total = Number(stats.blocks) * Number(stats.bsize);
  const free = Number(stats.bavail) * Number(stats.bsize);
  const ratio = total > 0 ? free / total : 0;
  const gb = (bytes) => (bytes / 1024 ** 3).toFixed(1);
  return {
    ok: ratio >= MIN_FREE_RATIO,
    message: `${gb(free)}GB متاحة من ${gb(total)}GB (${Math.round(ratio * 100)}%)`,
  };
}

function createDiskCheck({ statfs = (p) => fs.promises.statfs(p), record = opsStatus.record, path = "/", log = console.error } = {}) {
  return async function checkDisk() {
    try {
      const { ok, message } = describe(await statfs(path));
      await record("disk", ok, message);
      return { ok, message };
    } catch (error) {
      log("[diskCheck]", error?.message || error);
      return null;
    }
  };
}

function startDiskCheckJob() {
  const check = createDiskCheck();
  check();
  const timer = setInterval(check, EVERY_MS);
  timer.unref?.();
  return timer;
}

module.exports = { MIN_FREE_RATIO, describe, createDiskCheck, startDiskCheckJob };
