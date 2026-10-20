// Reads "new rows" from a collection that several server processes write to,
// without trusting _id order. ObjectIds from different processes (clock skew)
// or rows committed out of order can sort before rows already read, so an
// `_id > lastId` cursor would skip them. Instead every poll re-reads a window
// that starts `overlapMs` before the previous poll started, and drops rows it
// already returned (a bounded set of the most recent `maxSeen` ids).
//
//   const cursor = createOverlapCursor({ fetchSince: (from) => rows with at >= from });
//   const fresh = await cursor.next();
//
// Used by the live stream for LiveEvents (and later for AiAlerts). The window
// must be indexed: { <owner field>: 1, at: 1 }.
function createOverlapCursor({
  fetchSince,
  startAt,
  overlapMs = 30 * 1000,
  maxSeen = 500,
  now = () => Date.now(),
} = {}) {
  let lastPollStart = startAt === undefined ? now() : startAt;
  const seen = new Set(); // insertion order = delivery order, oldest first

  const remember = (id) => {
    seen.add(id);
    while (seen.size > maxSeen) seen.delete(seen.values().next().value);
  };

  async function next() {
    const pollStart = now();
    const rows = await fetchSince(new Date(lastPollStart - overlapMs));
    lastPollStart = pollStart;
    const fresh = [];
    for (const row of rows || []) {
      const id = String(row._id);
      if (seen.has(id)) continue;
      remember(id);
      fresh.push(row);
    }
    return fresh;
  }

  return { next, seenSize: () => seen.size };
}

module.exports = { createOverlapCursor };
