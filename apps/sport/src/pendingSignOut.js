// A sign-out that could not reach the server (no network, server down) is
// remembered on this device. Until the server confirms it, the session is
// never brought back on its own: the next start, a return of the network, or
// the next try finishes it first. A new sign-in clears it (Codex full review,
// 2026-11-18).
export const SIGN_OUT_PENDING_KEY = "tamheed.sport.pendingSignOut";

export function markSignOutPending() {
  try { window.localStorage.setItem(SIGN_OUT_PENDING_KEY, String(Date.now())); } catch { /* blocked storage */ }
}

export function clearSignOutPending() {
  try { window.localStorage.removeItem(SIGN_OUT_PENDING_KEY); } catch { /* blocked storage */ }
}

export function isSignOutPending() {
  try { return Boolean(window.localStorage.getItem(SIGN_OUT_PENDING_KEY)); } catch { return false; }
}

// The server answered the sign-out (2xx, or 4xx: the session is gone or was
// never valid): done. No answer or 5xx: still pending.
export const signOutReached = (status) => status >= 200 && status < 500;

// Finishes a pending sign-out with sendLogout() (answers the HTTP status, 0
// for no network). True when nothing is pending any more.
export async function finishPendingSignOut(sendLogout) {
  if (!isSignOutPending()) return true;
  let status = 0;
  try { status = Number(await sendLogout()) || 0; } catch { status = 0; }
  if (!signOutReached(status)) return false;
  clearSignOutPending();
  return true;
}
