// Moving between the sites. The pass travels in the address fragment (#pass=),
// which the browser never sends to a server or proxy log.

// system.<domain> for this site's host (it.<domain> → system.<domain>, owner
// 2026-11-03).
export const systemHostFor = (host) => `system.${String(host).replace(/^it\./i, "")}`;

// The everyday app's address: REACT_APP_SYSTEM_URL when set, else system.<domain>.
export const systemUrl = () => {
  const configured = String(process.env.REACT_APP_SYSTEM_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  const { protocol, host } = window.location;
  return `${protocol}//${systemHostFor(host)}`;
};

export const systemUrlWithPass = (pass) => `${systemUrl()}/#pass=${encodeURIComponent(pass)}`;

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

// Leaves this page for another address (Google's consent page, the other site).
export const goTo = (url) => window.location.assign(url);

// Opens the other site in a new tab, with the full address at once: an
// installed web app hands it to the other installed app (owner, 2026-11-03).
// A blocked tab falls back to this one.
export const openSite = (url) => {
  const tab = window.open(url, "_blank");
  if (!tab) { window.location.assign(url); return false; }
  try { tab.opener = null; } catch { /* another origin */ }
  return true;
};
