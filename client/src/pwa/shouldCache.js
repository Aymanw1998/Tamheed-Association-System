// Which requests the service worker may keep in the API cache: only plain
// GETs under /api/, and never the sign-in, code, photo or file endpoints.
const NEVER = [
  /^\/api\/auth(\/|$)/,
  /^\/api\/sport-portal\/request-code(\/|$)/,
  /^\/api\/sport-portal\/verify(\/|$)/,
  /^\/api\/sport-portal\/photo(\/|$)/,
  /^\/api\/storage(\/|$)/,
];

export function shouldCache(url, method) {
  if (String(method || "").toUpperCase() !== "GET") return false;
  let path;
  try {
    path = new URL(url, "http://local.invalid").pathname;
  } catch {
    return false;
  }
  if (!path.startsWith("/api/")) return false;
  return !NEVER.some((re) => re.test(path));
}
