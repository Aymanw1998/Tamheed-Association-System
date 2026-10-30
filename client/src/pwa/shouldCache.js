// Which requests the service worker may keep in the API cache: only plain
// GETs under /api/, and never the sign-in, code, photo or file endpoints.
// Matching ignores case, because the server treats paths that way.
const NEVER = [
  /^\/api\/auth(\/|$)/i,
  /^\/api\/sport-portal\/request-code(\/|$)/i,
  /^\/api\/sport-portal\/verify(\/|$)/i,
  /^\/api\/sport-portal\/photo(\/|$)/i,
  /^\/api\/storage/i,
  /^\/api\/live(\/|$)/i,
  /^\/api\/locks(\/|$)/i, // a lock's holder must always be read live
  /^\/api\/push(\/|$)/i, // the phone notifications switch must always be read live
  /^\/api\/invitetoken(\/|$)/i,
  /\/documents\/[^/]+\/download$/i,
];

export function shouldCache(url, method) {
  if (String(method || "").toUpperCase() !== "GET") return false;
  let path;
  try {
    path = new URL(url, "http://local.invalid").pathname;
  } catch {
    return false;
  }
  if (!/^\/api\//i.test(path)) return false;
  return !NEVER.some((re) => re.test(path));
}
