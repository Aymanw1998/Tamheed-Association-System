const { liveHub } = require("../../services/liveHub");

// GET /api/sport-portal/live: SSE for the signed-in student (after
// requireSportStudent). The hub writes `event: me` when staff change this
// student's data; the page then reloads /me with its own cookie. Events carry
// no data. A ": ping" comment every pingMs keeps proxies from closing it.
const PING_MS = 25 * 1000;

function createSportLive({ hub = liveHub, pingMs = PING_MS } = {}) {
  return function live(req, res) {
    const studentId = String(req.sportStudent._id);
    res.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();
    res.write("retry: 5000\n\n");

    let closed = false;
    let unsubscribe = () => {};
    let pingTimer = null;
    const finish = () => {
      if (closed) return;
      closed = true;
      clearInterval(pingTimer);
      unsubscribe();
      res.end();
    };
    // A write after the stream closed throws, which makes the hub drop this subscriber.
    unsubscribe = hub.subscribe("sport", studentId, (type, payload) => {
      if (closed) throw new Error("stream closed");
      res.write(`event: ${type}\ndata: ${JSON.stringify(payload ?? {})}\n\n`);
    });
    pingTimer = setInterval(() => { if (!closed) res.write(": ping\n\n"); }, pingMs);
    res.on("close", finish);
  };
}

module.exports = { createSportLive, PING_MS };
