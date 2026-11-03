// Passkeys (2026-11-01): the player saves one on the phone after signing in
// with the code or the card, then signs in with a fingerprint or face.
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { passkeyLoginOptions, passkeyLogin, passkeyRegisterOptions, passkeyRegister } from "./api.js";

const OFFERED_KEY = "tamheed-sport-passkey-offered";

export const passkeySupported = () => {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
};

// The phone's own prompt closed by the player (or timed out): not an error.
const cancelled = (err) => err?.name === "NotAllowedError" || err?.name === "AbortError";

export async function signInWithPasskey() {
  const opts = await passkeyLoginOptions();
  if (!opts.ok) return { ok: false, message: opts.data?.message || "" };
  let answer;
  try {
    answer = await startAuthentication({ optionsJSON: opts.data.options });
  } catch (err) {
    return cancelled(err) ? { ok: false, cancelled: true } : { ok: false, message: "" };
  }
  const r = await passkeyLogin(answer);
  return r.ok ? { ok: true } : { ok: false, message: r.data?.message || "" };
}

export async function savePasskey() {
  const opts = await passkeyRegisterOptions();
  if (!opts.ok) return { ok: false, message: opts.data?.message || "" };
  let answer;
  try {
    answer = await startRegistration({ optionsJSON: opts.data.options });
  } catch (err) {
    return cancelled(err) ? { ok: false, cancelled: true } : { ok: false, message: "" };
  }
  const r = await passkeyRegister(answer);
  if (r.ok) rememberOffer();
  return r.ok ? { ok: true } : { ok: false, message: r.data?.message || "" };
}

// The offer to save a passkey shows once per phone, until saved or put off.
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
