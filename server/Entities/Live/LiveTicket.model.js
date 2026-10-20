const api = require("../api");
const { ensureIndexes, collectionOf } = require("../../utils/ensureIndexes");

// Short-lived tickets that open the live stream (EventSource cannot send the
// Authorization header). Shape: ticketHash (sha256 of the ticket; the ticket
// itself is never stored), tz, tokenIat (iat of the access token it was issued
// for), createdAt, usedAt (set on first use). Kept in MongoDB so any server
// process can redeem a ticket issued by another.
const dbName = process.env.DB_NAME || "tamheed_db";
const LIVE_TICKET_TTL_SECONDS = 60;

const LiveTicketModelDef = { dbName, collection: "LiveTickets" };
LiveTicketModelDef.create = async function (data) {
  return await api.create({ dbName: this.dbName, collection: this.collection, data });
};
// Marks the ticket used and returns it, or null when it is unknown or was
// already used. The filter is the guard, so two redemptions cannot both win.
LiveTicketModelDef.consume = async function (ticketHash, usedAt = new Date()) {
  const res = await api.updateExisting({
    dbName: this.dbName,
    collection: this.collection,
    filter: { ticketHash, usedAt: { $exists: false } },
    newData: { usedAt },
  });
  return res.result || null;
};

// MongoDB removes expired tickets about once a minute; the stream also checks
// createdAt itself, so a late sweep never extends a ticket's life.
const LIVE_TICKET_INDEXES = [
  { key: { ticketHash: 1 }, options: { unique: true } },
  { key: { createdAt: 1 }, options: { expireAfterSeconds: LIVE_TICKET_TTL_SECONDS } },
];
const ensureLiveTicketIndexes = (collection) =>
  ensureIndexes(collection || collectionOf(LiveTicketModelDef), LIVE_TICKET_INDEXES);

module.exports = { LiveTicketModelDef, LIVE_TICKET_TTL_SECONDS, LIVE_TICKET_INDEXES, ensureLiveTicketIndexes };
