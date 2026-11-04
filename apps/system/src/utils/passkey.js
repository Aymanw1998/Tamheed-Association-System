// Passkeys in System (owner, 2026-11-04): saved while signed in; then a
// fingerprint or face signs in. The same flow as the IT and sport sites.
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import api from "../WebServer/services/api";

const OFFERED_KEY = "tamheed-system-passkey-offered";

export const passkeySupported = () => {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
};

// The device's own prompt closed by the user (or timed out): not an error.
const cancelled = (err) => err?.name === "NotAllowedError" || err?.name === "AbortError";
const post = async (path, body) => {
  try {
    const { data } = await api.post(path, body, { withCredentials: true });
    return data?.ok ? { ok: true, data } : { ok: false, message: data?.message || "" };
  } catch (err) {
    return { ok: false, message: err?.response?.data?.message || "" };
  }
};

// { ok, data } with the normal sign-in answer, or { ok: false, cancelled | message }.
export async function requestPasskeySignIn() {
  const opts = await post("/auth/passkey/login-options", {});
  if (!opts.ok) return opts;
  let response;
  try {
    response = await startAuthentication({ optionsJSON: opts.data.options });
  } catch (err) {
    return cancelled(err) ? { ok: false, cancelled: true } : { ok: false, message: "" };
  }
  return post("/auth/passkey/login", { response });
}

export async function savePasskey() {
  const opts = await post("/auth/passkey/register-options", {});
  if (!opts.ok) return opts;
  let response;
  try {
    response = await startRegistration({ optionsJSON: opts.data.options });
  } catch (err) {
    return cancelled(err) ? { ok: false, cancelled: true } : { ok: false, message: "" };
  }
  const saved = await post("/auth/passkey/register", { response });
  if (saved.ok) rememberOffer();
  return saved;
}

// The offer to save a passkey shows once per device, until saved or put off.
export function shouldOfferPasskey() {
  try {
    return passkeySupported() && !localStorage.getItem(OFFERED_KEY);
  } catch {
    return false;
  }
}

export function rememberOffer() {
  try {
    localStorage.setItem(OFFERED_KEY, "1");
  } catch {
    // Private mode: the offer may show again.
  }
}
