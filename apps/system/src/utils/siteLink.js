// Moving between the sites. The pass travels in the address fragment (#pass=),
// which the browser never sends to a server or proxy log.

// it.<domain> for this site's host: a leading «system.» or «www.» is replaced,
// never kept (system.<domain> → it.<domain>, owner 2026-11-03).
export const itHostFor = (host) => `it.${String(host).replace(/^(system|www)\./i, "")}`;

// The IT site's address: REACT_APP_IT_URL when set, else it.<domain>.
export const itUrl = () => {
  const configured = String(process.env.REACT_APP_IT_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  const { protocol, host } = window.location;
  return `${protocol}//${itHostFor(host)}`;
};

export const itUrlWithPass = (pass) => `${itUrl()}/#pass=${encodeURIComponent(pass)}`;

// Reads #pass=<pass> from the address and removes it at once (the rest of the
// fragment stays), so it is neither bookmarked nor left in the history entry.
export function takePassFromAddress() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const pass = params.get("pass");
  if (pass === null) return "";
  params.delete("pass");
  const rest = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${rest ? `#${rest}` : ""}`);
  return pass;
}

// An absolute link that points into the IT site (the alerts about a locked
// account or changed access carry one). Any other absolute link is refused.
export const isItLink = (link) => {
  if (typeof link !== "string") return false;
  try {
    const target = new URL(link);
    return target.origin === new URL(itUrl()).origin;
  } catch {
    return false;
  }
};

// Opens the other site in a new tab, with the full address at once: an
// installed web app hands it to the other installed app (owner, 2026-11-03).
// A blocked tab falls back to this one.
export const openSite = (url) => {
  const tab = window.open(url, "_blank");
  if (!tab) { window.location.assign(url); return false; }
  try { tab.opener = null; } catch { /* another origin */ }
  return true;
};
