const BASE = "/api/sport-portal";

async function call(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, ok: res.ok && data?.ok !== false, data };
}

export const getMe = () => call("/me");
export const requestCode = (tz) => call("/request-code", { method: "POST", body: JSON.stringify({ tz }) });
export const verifyCode = (tz, code) => call("/verify", { method: "POST", body: JSON.stringify({ tz, code }) });
export const logout = () => call("/logout", { method: "POST" });
export const PHOTO_URL = `${BASE}/photo`;
