import api, { API_BASE_URL } from "../api";
import { isDemo, subscribeDemo } from "../../../journey/demoMode";

// The signed-in live channel. EventSource cannot send the Authorization
// header, so each (re)connect first asks POST /live/ticket for a single-use
// ticket (through `api`, which adds the token and refreshes it), then opens
// GET /live/stream?ticket=... . The browser's own EventSource retry would
// reuse a spent ticket, so on any error the stream is closed and reopened
// here with a new ticket after a growing delay.
//
//   const close = openLiveStream({ onAlert, onStorage, onOpen });  ...  close();
//
// onStorage(payload): a file or folder the user can see changed
//                     ({ module, action, ts } only: reload to see what).
// onAlert(payload):   a personal alert.
// onOpen():           the stream (re)opened; events sent while it was closed
//                     are not replayed, so reload what the page shows.
//
// Training mode: no connection while it is on (an open stream closes when it
// starts), and the stream reopens when it ends.

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;
// After the server refuses the ticket request itself (401 / 403 / 423).
export const REFUSED_RETRY_MS = 5 * 60 * 1000;
const REFUSED_STATUSES = new Set([401, 403, 423]);

// 1 s, 2 s, 4 s ... up to 30 s.
export function backoffDelay(attempt) {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.min(attempt, 15));
}

async function defaultRequestTicket() {
  const { data } = await api.post("/live/ticket");
  return data?.ticket || null;
}

export function openLiveStream({ onAlert, onStorage, onOpen, deps = {} } = {}) {
  const {
    requestTicket = defaultRequestTicket,
    EventSourceImpl = typeof window !== "undefined" ? window.EventSource : undefined,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (t) => clearTimeout(t),
    baseUrl = API_BASE_URL,
  } = deps;

  let closed = false;
  let source = null;
  let timer = null;
  let attempt = 0;
  // Bumped by pause(): a ticket request started before it is ignored.
  let generation = 0;

  const deliver = (handler) => (event) => {
    if (typeof handler !== "function") return;
    try {
      handler(JSON.parse(event.data || "{}"));
    } catch (error) {
      console.error("live stream event error", error);
    }
  };

  const scheduleReconnect = () => {
    if (closed || timer) return;
    timer = setTimer(connect, backoffDelay(attempt));
    attempt += 1;
  };

  const pause = () => {
    generation += 1;
    if (timer) {
      clearTimer(timer);
      timer = null;
    }
    if (source) {
      source.close();
      source = null;
    }
  };

  async function connect() {
    timer = null;
    if (closed || !EventSourceImpl || isDemo()) return;
    const mine = generation;
    let ticket = null;
    let refused = false;
    try {
      ticket = await requestTicket();
    } catch (error) {
      refused = REFUSED_STATUSES.has(error?.response?.status);
    }
    if (closed || isDemo() || mine !== generation) return;
    if (refused) {
      // Signed out, password changed or account locked: asking again soon
      // would only repeat the refusal (the api layer handles the sign-out).
      timer = setTimer(connect, REFUSED_RETRY_MS);
      return;
    }
    if (!ticket) {
      scheduleReconnect();
      return;
    }

    const es = new EventSourceImpl(`${baseUrl}/live/stream?ticket=${encodeURIComponent(ticket)}`);
    source = es;
    es.onopen = () => {
      attempt = 0;
      if (typeof onOpen !== "function") return;
      try {
        onOpen();
      } catch (error) {
        console.error("live stream open handler error", error);
      }
    };
    es.onerror = () => {
      es.close();
      if (source === es) source = null;
      scheduleReconnect();
    };
    es.addEventListener("storage", deliver(onStorage));
    es.addEventListener("alert", deliver(onAlert));
  }

  const unsubscribeDemo = subscribeDemo((on) => {
    if (closed) return;
    pause();
    if (!on) {
      attempt = 0;
      connect();
    }
  });

  connect();

  return function close() {
    closed = true;
    unsubscribeDemo();
    pause();
  };
}
