// The wall display page (owner, 2026-11-12) runs without sign-in and without
// the app shell. Code shared with the signed-in app checks this before it
// moves the page anywhere, so the TV keeps its program and its link.
const WALL_PATH = /^\/display\/?$/;

export const isWallDisplay = (path = window.location.pathname) => WALL_PATH.test(String(path || ""));

// Where a logout announced by another tab sends this page: home, or nowhere
// on the wall display (it has no session to lose).
export function logoutBroadcastTarget(event, path) {
  if (!event || event.key !== "LOGOUT_BROADCAST" || !event.newValue) return null;
  return isWallDisplay(path) ? null : "/";
}
