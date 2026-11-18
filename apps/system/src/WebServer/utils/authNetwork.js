// A session check that failed for want of a connection is not a sign-out
// (Codex full review, 2026-11-18). Only an answer from the server that the
// session is gone (401/403, or a sign-out still waiting) signs the user out;
// no network, a timeout or a server error keeps the user in the app with what
// is already on the device, until the connection is back.
import { getStoredUserTz } from "../../utils/session";
import { isSignOutPending } from "../../utils/pendingSignOut";

// Read as is (logoutScheduler's getter signs out when it has passed, which a
// plain question must not do).
const LOGOUT_DEADLINE_KEY = "LOGOUT_DEADLINE_MS";
const getLogoutDeadline = () => {
  try {
    const ms = Number(window.localStorage.getItem(LOGOUT_DEADLINE_KEY));
    return Number.isFinite(ms) && ms > 0 ? ms : null;
  } catch {
    return null;
  }
};

export function isConnectionFailure(err) {
  if (!err || err.code === "SIGN_OUT_PENDING") return false;
  const status = err.response?.status;
  if (!status) return true; // no answer at all: offline, timeout, DNS
  return status >= 500 || status === 408 || status === 429;
}

// Someone signed in on this device before, no sign-out is waiting, and the
// session's own end (the auto sign-out time) has not come: the app may stay
// open without the server for now.
export function mayStayOffline(now = Date.now()) {
  if (!getStoredUserTz() || isSignOutPending()) return false;
  const deadline = getLogoutDeadline();
  return !(deadline && now >= deadline);
}
