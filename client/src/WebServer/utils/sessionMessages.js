export const SESSION_EXPIRED_KEY = 'SESSION_EXPIRED_REASON';

export function markSessionExpired(reason = 'פג תוקף ההתחברות, אנא התחבר/י שוב') {
  try { sessionStorage.setItem(SESSION_EXPIRED_KEY, reason); } catch {}
}

export function consumeSessionExpired() {
  try {
    const reason = sessionStorage.getItem(SESSION_EXPIRED_KEY);
    if (reason) sessionStorage.removeItem(SESSION_EXPIRED_KEY);
    return reason;
  } catch { return null; }
}
