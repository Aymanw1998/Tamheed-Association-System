const crypto = require("crypto");
const express = require("express");
const { requireAuth } = require("../../middleware/authMiddleware");
const { loadActor } = require("../../middleware/permissionMiddleware");
const { logWithSource } = require("../../middleware/logger");
const { LIVE_TICKET_TTL_SECONDS } = require("./LiveTicket.model");
const { createOverlapCursor } = require("../../services/overlapCursor");
const { canSeeAlertType } = require("../../services/alertAccess");
const { liveHub } = require("../../services/liveHub");

// The signed-in live channel (replaces the old open /api/events).
//   POST /ticket          requireAuth + loadActor -> { ok, ticket } (single use, 60 s)
//   GET  /stream?ticket=  SSE of the ticket owner's LiveEvents, plus their new
//                         unread AiAlerts as `alert` events (only the types they
//                         may still see, re-judged at every re-check)
// router.endAllStreams() ends every open stream (used by the fatal shutdown).
// EventSource cannot send the Authorization header, hence the ticket. The
// stream reads new rows from MongoDB every pollMs (any server process may have
// written them), sends a ": ping" comment every pingMs, re-checks the user
// every recheckEveryPolls polls and ends after maxStreamMs.
const POLL_MS = 10 * 1000;
const PING_MS = 25 * 1000;
const BATCH = 500;
// Each poll re-reads events from 30 s before the previous poll (overlapCursor).
const OVERLAP_MS = 30 * 1000;
// The user is re-checked every 6 polls (~1 min); a stream lasts at most 1 h.
const RECHECK_EVERY_POLLS = 6;
const MAX_STREAM_MS = 60 * 60 * 1000;
// Only these LiveEvent types reach the browser. Alerts come from AiAlerts
// (see `alerts` below), not from LiveEvents.
const STREAM_TYPES = new Set(["storage", "change", "lock"]);
const TICKET_INVALID = { code: "TICKET_INVALID", message: "رابط البث غير صالح أو منتهي" };
const SERVER_ERROR = "حدث خطأ غير متوقع، حاول مرة أخرى";

// What the browser gets for an alert (never the recipient or the dedup key).
const alertView = (row) => ({
  id: String(row._id),
  type: row.type,
  severity: row.severity,
  text: row.text,
  link: row.link || "",
  at: row.at,
});

const hashTicket = (ticket) => crypto.createHash("sha256").update(ticket).digest("hex");

function createLiveRouter({
  requireAuth,
  loadActor,
  tickets,
  events,
  // AiAlerts store with since(tz, from, limit) -> unread rows, oldest first.
  alerts = null,
  // Instant `change` / `lock` events from this process (services/liveHub).
  hub = liveHub,
  now = () => Date.now(),
  pollMs = POLL_MS,
  pingMs = PING_MS,
  overlapMs = OVERLAP_MS,
  recheckEveryPolls = RECHECK_EVERY_POLLS,
  maxStreamMs = MAX_STREAM_MS,
  // Lower bound (ms) for the first read; tests pass 0 to read everything.
  startAt = now,
}) {
  const router = express.Router();
  // finish() of every open stream, so a shutdown can end them all at once.
  const openStreams = new Set();
  router.endAllStreams = () => { for (const finish of [...openStreams]) finish(); };

  router.post("/ticket", requireAuth, loadActor, async (req, res) => {
    try {
      const ticket = crypto.randomBytes(32).toString("base64url");
      await tickets.create({
        ticketHash: hashTicket(ticket),
        tz: req.actor.tz,
        tokenIat: typeof req.user?.iat === "number" ? req.user.iat : null,
        createdAt: new Date(now()),
      });
      return res.status(200).json({ ok: true, ticket });
    } catch (error) {
      logWithSource("Live.ticket", error);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  });

  // Redeems the ticket, then checks the user exactly as loadActor does
  // (still active, not locked, token not older than the password).
  async function redeemTicket(req, res, next) {
    try {
      const raw = typeof req.query.ticket === "string" ? req.query.ticket : "";
      if (!raw || raw.length > 200) return res.status(401).json(TICKET_INVALID);
      const ticket = await tickets.consume(hashTicket(raw), new Date(now()));
      const issued = ticket ? new Date(ticket.createdAt).getTime() : NaN;
      if (!ticket || !(now() - issued < LIVE_TICKET_TTL_SECONDS * 1000)) {
        return res.status(401).json(TICKET_INVALID);
      }
      req.user = { tz: ticket.tz, ...(typeof ticket.tokenIat === "number" ? { iat: ticket.tokenIat } : {}) };
      return next();
    } catch (error) {
      logWithSource("Live.stream", error);
      return res.status(500).json({ ok: false, message: SERVER_ERROR });
    }
  }

  // Runs loadActor's checks again for an open stream (active, not locked,
  // token not stale) -> { ok, actor }. ok is false only when the user was
  // refused; actor is their fresh actor, or null after a lookup error (which
  // keeps the stream: the next re-check tries again).
  const recheck = (user) => new Promise((resolve) => {
    const req = { user: { ...user } };
    const refused = { status() { return this; }, json() { resolve({ ok: false }); return this; } };
    Promise.resolve(loadActor(req, refused, (error) => {
      if (error) logWithSource("Live.recheck", error.message);
      resolve({ ok: true, actor: error ? null : req.actor || null });
    })).catch(() => resolve({ ok: true, actor: null }));
  });

  function stream(req, res) {
    const tz = req.actor.tz;
    const user = req.user;
    // Refreshed at every re-check, so a permission change applies to alerts.
    let actor = req.actor;
    res.status(200).set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();
    res.write("retry: 5000\n\n");

    const cursor = createOverlapCursor({
      fetchSince: (from) => events.since(tz, from, BATCH),
      startAt: startAt(),
      overlapMs,
      now,
    });
    const alertCursor = alerts && createOverlapCursor({
      fetchSince: (from) => alerts.since(tz, from, BATCH),
      startAt: startAt(),
      overlapMs,
      now,
    });
    let closed = false;
    let polling = false;
    let polls = 0;
    let pollTimer = null;
    let pingTimer = null;
    let capTimer = null;
    let unsubscribe = () => {};

    const finish = () => {
      if (closed) return;
      closed = true;
      clearInterval(pollTimer);
      clearInterval(pingTimer);
      clearTimeout(capTimer);
      openStreams.delete(finish);
      unsubscribe();
      res.end();
    };

    const poll = async () => {
      if (closed || polling) return;
      polling = true;
      try {
        polls += 1;
        if (polls % recheckEveryPolls === 0) {
          const checked = await recheck(user);
          if (!checked.ok) return finish();
          if (checked.actor) actor = checked.actor;
        }
        if (closed) return;
        for (const event of await cursor.next()) {
          if (closed) return;
          if (!STREAM_TYPES.has(event.type)) continue;
          res.write(`id: ${event._id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.payload ?? {})}\n\n`);
        }
        for (const alert of alertCursor ? await alertCursor.next() : []) {
          if (closed) return;
          if (!canSeeAlertType(actor, alert.type)) continue;
          res.write(`id: ${alert._id}\nevent: alert\ndata: ${JSON.stringify(alertView(alert))}\n\n`);
        }
      } catch (error) {
        logWithSource("Live.poll", error.message);
      } finally {
        polling = false;
      }
    };

    // Instant events: written at once, not on the next poll. A write after the
    // stream closed throws, which makes the hub drop this subscriber.
    unsubscribe = hub.subscribe("staff", tz, (type, payload) => {
      if (closed) throw new Error("stream closed");
      res.write(`event: ${type}
data: ${JSON.stringify(payload ?? {})}

`);
    });
    openStreams.add(finish);
    pollTimer = setInterval(poll, pollMs);
    pingTimer = setInterval(() => { if (!closed) res.write(": ping\n\n"); }, pingMs);
    // The client reconnects with a new ticket, which re-checks everything.
    capTimer = setTimeout(finish, maxStreamMs);
    poll();

    res.on("close", finish);
  }

  router.get("/stream", redeemTicket, loadActor, stream);

  return router;
}

const router = createLiveRouter({
  requireAuth,
  loadActor,
  tickets: require("./LiveTicket.model").LiveTicketModelDef,
  events: require("./LiveEvent.model").LiveEventModelDef,
  alerts: require("../Alert/Alert.model").AlertModelDef,
});

module.exports = router;
module.exports.createLiveRouter = createLiveRouter;
// (router.endAllStreams is exported with the router itself.)
