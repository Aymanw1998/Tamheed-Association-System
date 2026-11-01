// Sign-in card (2026-11-01): a player without email gets a printed card whose
// QR opens this site at /#card=<token>. The token is in the #fragment, so it
// never reaches a server log; it is sent once to /card and then wiped from
// the address bar (and so from the history and a later screenshot).

export function cardToken(hash) {
  const m = /^#card=([A-Za-z0-9_-]+)$/.exec(String(hash || ""));
  return m ? m[1] : "";
}

// { tried: false } without a card link; otherwise whether it signed in.
export async function signInFromCard({ location, history, signIn }) {
  const token = cardToken(location.hash);
  if (!token) return { tried: false };
  history.replaceState(null, "", `${location.pathname}${location.search}`);
  const r = await signIn(token);
  return { tried: true, ok: Boolean(r?.ok), message: r?.ok ? "" : r?.data?.message || "" };
}
