// Stops the process after a fatal error (an unhandled rejection). server.close()
// waits for every open connection, and a live stream can stay open for up to
// an hour, so the open streams are ended and all connections dropped first,
// and a hard exit follows after graceMs whatever happens. The timer is unref'd
// so it never keeps an otherwise finished process alive. Runs once.
const GRACE_MS = 5000;

function createFatalShutdown({
  server,
  endStreams = () => {},
  exit = (code) => process.exit(code),
  setTimer = setTimeout,
  graceMs = GRACE_MS,
} = {}) {
  let started = false;
  return function shutdown() {
    if (started) return;
    started = true;
    const hard = setTimer(() => exit(1), graceMs);
    hard?.unref?.();
    try { endStreams(); } catch (error) { console.error("Ending live streams failed:", error.message); }
    try {
      server.close(() => exit(1));
      server.closeAllConnections?.();
    } catch (error) {
      console.error("Closing the server failed:", error.message);
      exit(1);
    }
  };
}

module.exports = { createFatalShutdown, GRACE_MS };
