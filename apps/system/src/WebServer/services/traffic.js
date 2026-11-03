import axios from "axios";

// The one place every API request passes through on its way to the network
// (wrapTraffic wraps the axios instance's adapter, below training mode and the
// token refresh), so no screen has to change:
//   1. The same read already on its way is shared, not sent again: two screens
//      that ask together get one request.
//   2. A read answered a moment ago is answered from memory: for SHORT_MS, or
//      LONG_MS for the session-wide reads in LONG. Any write (POST/PUT/PATCH/
//      DELETE other than the reads in READ_POSTS), a live "change" or a new
//      live connection, a token change and sign-out empty it at once.
//   3. At most MAX_PARALLEL requests are on the network together; screen data
//      goes first, background reads (BACKGROUND) wait for a free slot.
// Each caller gets its own copy of the answer, so changing it never changes
// what the next caller gets.
export const MAX_PARALLEL = 4;
export const SHORT_MS = 3 * 1000;
export const LONG_MS = 30 * 1000;

// Reads sent as POST (they change nothing on the server).
const READ_POSTS = [/^\/auth\/me$/];
// Session-wide reads that change rarely: kept for LONG_MS.
const LONG = [/^\/auth\/me$/, /^\/vehicle\/me\/permissions$/, /^\/tours$/, /^\/notices\/unread-count$/];
// Never kept: lock state, live channel, session refresh, files and downloads,
// and the assistant (its chat is written with fetch, outside this layer).
const NEVER = [/^\/locks(\/|$)/, /^\/live(\/|$)/, /^\/auth\/refresh$/, /^\/storage(\/|$)/, /^\/ai(\/|$)/];
// Not needed to draw the screen: they wait behind the rest.
const BACKGROUND = [/^\/notices\/unread-count$/, /^\/vehicle\/alerts$/, /^\/tours$/, /^\/inviteToken\/link$/, /^\/alerts(\/|$)/, /^\/push(\/|$)/];

const pathOf = (config) => {
  const url = String(config.url || "");
  const path = url.replace(/^https?:\/\/[^/]+/, "").replace(/^\/api(?=\/)/, "").split("?")[0];
  return path.replace(/\/+$/, "") || "/";
};
const matches = (list, path) => list.some((re) => re.test(path));
const methodOf = (config) => String(config.method || "get").toLowerCase();
const isRead = (config) => methodOf(config) === "get" || (methodOf(config) === "post" && matches(READ_POSTS, pathOf(config)));

const keyOf = (config) => {
  const headers = config.headers || {};
  const auth = typeof headers.get === "function" ? headers.get("Authorization") : headers.Authorization;
  return JSON.stringify([methodOf(config), pathOf(config), String(config.url || "").split("?")[1] || "", config.params || null, auth || ""]);
};

const copy = (response, config) => ({
  ...response,
  config,
  data: response.data === undefined ? undefined : JSON.parse(JSON.stringify(response.data)),
});

const withConfig = (error, config) => {
  if (!error || typeof error !== "object") return error;
  const own = Object.assign(Object.create(Object.getPrototypeOf(error)), error, { config });
  own.message = error.message;
  own.stack = error.stack;
  return own;
};

export function createTraffic({ now = () => Date.now(), maxParallel = MAX_PARALLEL } = {}) {
  const inFlight = new Map(); // key -> promise of the network response
  const kept = new Map(); // key -> { at, ttl, response }
  let generation = 0;
  let running = 0;
  const waiting = { high: [], low: [] };

  const next = () => {
    while (running < maxParallel && (waiting.high.length || waiting.low.length)) {
      const job = waiting.high.shift() || waiting.low.shift();
      running += 1;
      job();
    }
  };

  // Runs send() when a slot is free; background reads queue behind the rest.
  const slot = (config, send) => new Promise((resolve, reject) => {
    const job = () => {
      Promise.resolve()
        .then(send)
        .then(resolve, reject)
        .finally(() => { running -= 1; next(); });
    };
    (matches(BACKGROUND, pathOf(config)) ? waiting.low : waiting.high).push(job);
    next();
  });

  function clear() {
    generation += 1;
    kept.clear();
    inFlight.clear();
  }

  function wrap(network) {
    const adapter = (config) => {
      const path = pathOf(config);
      const cacheable = isRead(config) && !matches(NEVER, path) && (!config.responseType || config.responseType === "json");
      if (!cacheable) {
        if (isRead(config)) return slot(config, () => network(config));
        // A write: what was kept may be out of date now, and again when it
        // ends, so a read that ran alongside it is never kept.
        clear();
        const settle = () => clear();
        return slot(config, () => network(config)).then(
          (response) => { settle(); return response; },
          (error) => { settle(); throw error; },
        );
      }

      const key = keyOf(config);
      const hit = kept.get(key);
      if (hit && now() - hit.at < hit.ttl) return Promise.resolve(copy(hit.response, config));

      let shared = inFlight.get(key);
      if (!shared) {
        const startedIn = generation;
        shared = slot(config, () => network(config)).then((response) => {
          // Kept only when nothing was written while it was on its way.
          if (generation === startedIn) kept.set(key, { at: now(), ttl: matches(LONG, path) ? LONG_MS : SHORT_MS, response });
          return response;
        });
        inFlight.set(key, shared);
        const done = () => { if (inFlight.get(key) === shared) inFlight.delete(key); };
        shared.then(done, done);
      }
      // Each caller gets its own copy, and on failure its own error with its own
      // request (the token refresh marks and retries the request it is given).
      return shared.then(
        (response) => copy(response, config),
        (error) => { throw withConfig(error, config); },
      );
    };
    return adapter;
  }

  return { wrap, clear, stats: () => ({ running, waiting: waiting.high.length + waiting.low.length, kept: kept.size }) };
}

export const traffic = createTraffic();
export const clearTraffic = () => traffic.clear();

// Puts the layer under an axios instance's network adapter.
export function wrapTraffic(instance, layer = traffic) {
  const network = axios.getAdapter(instance.defaults.adapter);
  instance.defaults.adapter = layer.wrap(network);
}
