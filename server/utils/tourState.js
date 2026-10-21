// Pure rules for the per-user product-tour state kept on the user record.
const TOUR_ID_RE = /^[a-z][a-zA-Z0-9-]{0,39}$/;
const RELEASE_ID_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
const TOUR_STATUSES = ["done", "skipped"];
const MAX_TOURS = 100;
const MAX_RELEASES_PER_REQUEST = 50;
const MAX_RELEASES = 500;

// `id` comes from the URL, status and version from the body.
function parseTourUpdate(id, body) {
  if (typeof id !== "string" || !TOUR_ID_RE.test(id)) return null;
  const { status, version } = body || {};
  if (!TOUR_STATUSES.includes(status)) return null;
  if (!Number.isInteger(version) || version < 1 || version > 1000) return null;
  return { id, status, version };
}

// Only keys the actor really holds are remembered, so a client cannot claim others.
function mergeKnownKeys(current, incoming, held) {
  const keys = new Set(Array.isArray(current) ? current : []);
  if (Array.isArray(incoming)) {
    for (const key of incoming) {
      if (typeof key === "string" && held.has(key)) keys.add(key);
    }
  }
  return [...keys].sort();
}

function mergeSeenReleases(current, incoming) {
  if (!Array.isArray(incoming) || incoming.length > MAX_RELEASES_PER_REQUEST) return null;
  const merged = new Set(Array.isArray(current) ? current : []);
  for (const id of incoming) {
    if (typeof id === "string" && RELEASE_ID_RE.test(id)) merged.add(id);
  }
  return [...merged].slice(-MAX_RELEASES);
}

function tourSummary(tours) {
  const summary = { welcome: "none", done: 0, skipped: 0 };
  for (const [id, entry] of Object.entries(tours || {})) {
    const status = entry?.status;
    if (id === "welcome") {
      if (TOUR_STATUSES.includes(status)) summary.welcome = status;
    } else if (status === "done") summary.done += 1;
    else if (status === "skipped") summary.skipped += 1;
  }
  return summary;
}

function applyTour(tours, update) {
  const next = Object.create(null);
  for (const [id, entry] of Object.entries(tours || {})) next[id] = entry;
  if (!(update.id in next) && Object.keys(next).length >= MAX_TOURS) return null;
  next[update.id] = { status: update.status, version: update.version, at: new Date() };
  return next;
}

module.exports = {
  TOUR_ID_RE,
  MAX_TOURS,
  parseTourUpdate,
  mergeKnownKeys,
  mergeSeenReleases,
  tourSummary,
  applyTour,
};
