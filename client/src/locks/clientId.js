// One random id per browser tab. sessionStorage is per tab and survives a
// reload, so a reloaded tab keeps (and can release) its own locks, while the
// same user in another tab gets a different id and is blocked like anyone else.
//
// A duplicated tab gets a copy of sessionStorage, so it would share the id.
// Two checks catch that:
//   - per load: window.name survives a reload of the same tab but is not
//     copied into a duplicate, so a stored id it does not name was copied;
//   - startClientIdGuard(): a BroadcastChannel handshake. The new tab asks
//     "is X in use?"; any other tab using X answers, and the new tab mints a
//     fresh id.
const STORAGE_KEY = "tamheed-client-id";
const NAME_PREFIX = "tamheed-client-id:";
const CHANNEL = "tamheed-client-id";
let fallbackId = null;
let checkedThisLoad = false;

function randomId() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

function markWindow(id) {
  try {
    window.name = `${NAME_PREFIX}${id}`;
  } catch {}
}

function mint() {
  const id = randomId();
  sessionStorage.setItem(STORAGE_KEY, id);
  markWindow(id);
  return id;
}

export function getClientId() {
  try {
    let id = sessionStorage.getItem(STORAGE_KEY);
    if (!checkedThisLoad) {
      checkedThisLoad = true;
      let named = "";
      try { named = String(window.name || ""); } catch {}
      // A stored id this window does not name was copied from another tab.
      if (id && named !== `${NAME_PREFIX}${id}`) id = null;
    }
    if (!id) id = mint();
    else markWindow(id);
    return id;
  } catch {
    // Storage blocked: one id for the life of the page.
    if (!fallbackId) fallbackId = randomId();
    return fallbackId;
  }
}

const defaultChannel = () =>
  typeof BroadcastChannel === "function" ? new BroadcastChannel(CHANNEL) : null;

// Answers other tabs' questions about our id, and asks once whether ours is
// already in use. Returns a stop function.
export function startClientIdGuard({ makeChannel = defaultChannel } = {}) {
  let channel = null;
  try {
    channel = makeChannel();
  } catch {}
  if (!channel) return () => {};
  const asked = getClientId();
  channel.onmessage = (event) => {
    const msg = event?.data || {};
    const mine = getClientId();
    if (msg.type === "query" && msg.id === mine) {
      channel.postMessage({ type: "in-use", id: mine });
    } else if (msg.type === "in-use" && msg.id === asked && mine === asked) {
      try {
        mint();
      } catch {}
    }
  };
  channel.postMessage({ type: "query", id: asked });
  return () => {
    try {
      channel.close();
    } catch {}
  };
}
