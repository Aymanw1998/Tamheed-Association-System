// What the guide does on the page during a step (the user only watches):
//   runAction(action, { navigate, find }) -> Promise<void>
// action: { type: "navigate", path } | { type: "click", target }
//       | { type: "type", target, value } | { type: "select", target, value }
//       | { type: "cancelConfirm" } | { type: "wait", ms }
// `find(target)` returns the element of a `data-tour` target, or null. A target
// may show up a moment later (a dialog opening, a list loading), so it is
// polled for up to `timeout` ms; if it never shows, the promise rejects with
// an Error whose message and code are "TARGET_MISSING".
//
// The journey blocks real clicks on the page (JourneyProvider). Its own clicks
// are synthetic events marked `__journey = true`; a form submit that such a
// click triggers is dispatched while `acting` is set, and isJourneyEvent()
// lets both through.

export const TARGET_MISSING = "TARGET_MISSING";
const TARGET_WAIT_MS = 4000;
const POLL_MS = 100;
const CHAR_DELAY_MS = 40;

// Dialog of Components/Provides/ConfirmContext.jsx.
const CONFIRM_CANCEL = '[role="dialog"] [data-confirm="cancel"], .c-overlay .c-actions .c-btn:first-child';

let acting = 0;

export const isJourneyEvent = (event) => Boolean(event && (event.__journey === true || acting > 0));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms || 0)));

const missing = () => {
  const error = new Error(TARGET_MISSING);
  error.code = TARGET_MISSING;
  return error;
};

const defaultFind = (target) => {
  try {
    return document.querySelector(`[data-tour="${String(target).replace(/["\\]/g, "")}"]`);
  } catch {
    return null;
  }
};

async function waitFor(lookup, timeout) {
  const started = Date.now();
  for (;;) {
    const el = lookup();
    if (el) return el;
    if (Date.now() - started >= timeout) throw missing();
    await sleep(Math.min(POLL_MS, timeout));
  }
}

const reveal = (el) => {
  try {
    if (typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "center", behavior: "smooth" });
  } catch {}
};

// Dispatched synchronously, so anything the click sets off (a submit) is
// dispatched while `acting` is set.
function journeyClick(el) {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
  event.__journey = true;
  acting += 1;
  try {
    el.dispatchEvent(event);
  } finally {
    acting -= 1;
  }
}

// React tracks an input's value through its own property; writing through the
// prototype's setter is what makes React see the change on the next event.
function nativeSetValue(el, value) {
  const proto = Object.getPrototypeOf(el);
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value")
    || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
  if (descriptor && descriptor.set) descriptor.set.call(el, value);
  else el.value = value;
}

const fire = (el, name) => el.dispatchEvent(new Event(name, { bubbles: true }));

async function typeInto(el, value, charDelay) {
  try {
    el.focus({ preventScroll: true });
  } catch {}
  const text = Array.from(String(value ?? ""));
  nativeSetValue(el, "");
  let current = "";
  for (let i = 0; i < text.length; i += 1) {
    current += text[i];
    nativeSetValue(el, current);
    fire(el, "input");
    if (charDelay > 0) await sleep(charDelay);
  }
  // An empty value still has to reach React once.
  if (!text.length) fire(el, "input");
}

export async function runAction(action, { navigate, find = defaultFind, timeout = TARGET_WAIT_MS, charDelay = CHAR_DELAY_MS } = {}) {
  const type = action && action.type;
  const target = () => waitFor(() => find(action.target), timeout);
  switch (type) {
    case "navigate":
      if (typeof navigate === "function") navigate(action.path);
      return;
    case "wait":
      await sleep(action.ms);
      return;
    case "click": {
      const el = await target();
      reveal(el);
      journeyClick(el);
      return;
    }
    case "type": {
      const el = await target();
      reveal(el);
      await typeInto(el, action.value, charDelay);
      return;
    }
    case "select": {
      const el = await target();
      reveal(el);
      nativeSetValue(el, String(action.value ?? ""));
      fire(el, "input");
      fire(el, "change");
      return;
    }
    case "cancelConfirm": {
      const el = await waitFor(() => document.querySelector(CONFIRM_CANCEL), timeout);
      journeyClick(el);
      return;
    }
    default:
      throw new Error("UNKNOWN_ACTION");
  }
}
