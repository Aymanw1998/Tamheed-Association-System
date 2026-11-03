// Live link to the server while signed in: when staff change this player the
// server sends a `me` event and the page quietly reloads /me. If the stream
// breaks it is closed and opened again with a growing wait (1 s, 2 s, 4 s ...
// at most 30 s); once the new stream is open, /me is reloaded once because
// events may have been missed meanwhile. Returns a function that closes it all.
export const LIVE_URL = "/api/sport-portal/live";
const FIRST_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

export function openLiveMe(onMe, {
  url = LIVE_URL,
  EventSourceImpl = typeof EventSource === "undefined" ? null : EventSource,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
} = {}) {
  if (!EventSourceImpl) return () => {};
  let source = null;
  let timer = null;
  let delay = FIRST_DELAY_MS;
  let closed = false;
  let reconnecting = false;

  const connect = () => {
    timer = null;
    if (closed) return;
    const es = new EventSourceImpl(url);
    source = es;
    es.addEventListener("me", () => { if (!closed && source === es) onMe(); });
    es.onopen = () => {
      if (closed || source !== es) return;
      delay = FIRST_DELAY_MS;
      if (reconnecting) {
        reconnecting = false;
        onMe();
      }
    };
    es.onerror = () => {
      if (closed || source !== es) return;
      es.close();
      source = null;
      reconnecting = true;
      timer = setTimer(connect, delay);
      delay = Math.min(delay * 2, MAX_DELAY_MS);
    };
  };

  connect();
  return () => {
    closed = true;
    if (timer !== null) clearTimer(timer);
    timer = null;
    if (source) source.close();
    source = null;
  };
}
