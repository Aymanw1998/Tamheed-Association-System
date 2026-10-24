// Which requests the service worker may keep in the API cache: only the
// student's own card (GET /api/sport-portal/me). The sign-in, code, photo and
// every other endpoint are never cached. Matching ignores case, because the
// server treats paths that way.
const ALLOWED = /^\/api\/sport-portal\/me\/?$/i;

export function shouldCache(url, method) {
  if (String(method || "").toUpperCase() !== "GET") return false;
  let path;
  try {
    path = new URL(url, "http://local.invalid").pathname;
  } catch {
    return false;
  }
  return ALLOWED.test(path);
}
