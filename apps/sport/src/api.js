const BASE = "/api/sport-portal";

export const TOO_MANY_MESSAGE = "محاولات كثيرة. حاول مرة أخرى بعد قليل.";
export const GENERIC_ERROR_MESSAGE = "حدث خطأ، حاول مرة أخرى.";
const ACTIONABLE_CODES = new Set(["NO_EMAIL", "NOT_IN_SPORT"]);

// Only 200 and 400 bodies carry a server message that is safe to show as is.
// Everything else (429 from the shared limiter, 500, network) gets a fixed Arabic message.
export function shapeResult(status, data) {
  if (status === 429) return { status, ok: false, data: { ok: false, message: TOO_MANY_MESSAGE } };
  // The sign-in answers that tell the student what to do (no email on file,
  // not in the sport department: ask a guide) keep their text: retrying
  // cannot help there (Codex full review, 2026-11-18).
  if (status === 404 && ACTIONABLE_CODES.has(data?.code)) {
    const message = typeof data?.message === "string" && data.message.trim() ? data.message : GENERIC_ERROR_MESSAGE;
    return { status, ok: false, data: { ok: false, code: data.code, message } };
  }
  if (status === 200 || status === 400) {
    return { status, ok: status === 200 && data?.ok !== false, data };
  }
  return { status, ok: false, data: { ok: false, message: GENERIC_ERROR_MESSAGE } };
}

async function call(path, options = {}) {
  try {
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
    return shapeResult(res.status, data);
  } catch {
    return shapeResult(0, null);
  }
}

export const getMe = () => call("/me");
// The student's own ID number: never kept offline (see pwa/shouldCache.js).
// The staff's notices to this student; not kept offline either.
export const getNotices = () => call("/notices", { cache: "no-store" });
export const getIdNumber = () => call("/id", { cache: "no-store" });
export const requestCode = (tz) => call("/request-code", { method: "POST", body: JSON.stringify({ tz }) });
export const verifyCode = (tz, code) => call("/verify", { method: "POST", body: JSON.stringify({ tz, code }) });
// The printed sign-in card's QR (players without email).
export const signInWithCard = (token) => call("/card", { method: "POST", body: JSON.stringify({ token }) });
// Passkeys: options from the server, the phone's answer back (passkey.js).
export const passkeyLoginOptions = () => call("/passkey/login-options", { method: "POST" });
export const passkeyLogin = (response) => call("/passkey/login", { method: "POST", body: JSON.stringify({ response }) });
export const passkeyRegisterOptions = () => call("/passkey/register-options", { method: "POST" });
export const passkeyRegister = (response) => call("/passkey/register", { method: "POST", body: JSON.stringify({ response }) });
export const logout = () => call("/logout", { method: "POST" });
export const PHOTO_URL = `${BASE}/photo`;
// The version changes with the photo, so a new photo is not hidden by the browser cache.
export const photoUrl = (version) => (version ? `${PHOTO_URL}?v=${encodeURIComponent(version)}` : PHOTO_URL);
