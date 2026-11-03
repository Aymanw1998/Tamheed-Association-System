// Moving between the sites. The pass travels in the address fragment (#pass=),
// which the browser never sends to a server or proxy log.

// The everyday app's address: REACT_APP_SYSTEM_URL when set, else this site's
// address without the leading "it." label.
export const systemUrl = () => {
  const configured = String(process.env.REACT_APP_SYSTEM_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  const { protocol, host } = window.location;
  return `${protocol}//${host.replace(/^it\./i, "")}`;
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
