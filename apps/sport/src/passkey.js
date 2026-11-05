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
  if (r.ok) signedInWithPasskey();
  return r.ok ? { ok: true } : { ok: false, message: r.data?.message || "" };
}

export async function savePasskey(account) {
  const opts = await passkeyRegisterOptions();
  if (!opts.ok) return { ok: false, message: opts.data?.message || "" };
  let answer;
  try {
    answer = await startRegistration({ optionsJSON: opts.data.options });
  } catch (err) {
    return cancelled(err) ? { ok: false, cancelled: true } : { ok: false, message: "" };
  }
  const r = await passkeyRegister(answer);
  if (r.ok) rememberSaved(account);
  return r.ok ? { ok: true } : { ok: false, message: r.data?.message || "" };
}

// The offer goes by account and device, so a second person on a shared device is
// asked too. Saved, or signed in with one here: not asked again. «لاحقًا»: asked
// again at the next sign-in (the sign-in page calls newSignIn).
const savedKey = (account) => `${OFFERED_KEY}:${account}`;
const LATER_KEY = `${OFFERED_KEY}-later`;
const VIA_PASSKEY_KEY = `${OFFERED_KEY}-via`;

export function shouldOfferPasskey(account) {
  if (!account) return false;
  try {
    if (!passkeySupported() || localStorage.getItem(savedKey(account))) return false;
    if (sessionStorage.getItem(VIA_PASSKEY_KEY)) {
      localStorage.setItem(savedKey(account), "1");
      return false;
    }
    return sessionStorage.getItem(LATER_KEY) !== String(account);
  } catch {
    return false;
  }
}

export function rememberSaved(account) {
  try {
    if (account) localStorage.setItem(savedKey(account), "1");
  } catch {
    // Private mode: the offer may show again.
  }
}

export function rememberOffer(account) {
  try {
    sessionStorage.setItem(LATER_KEY, String(account));
  } catch {
    // Private mode: the offer may show again.
  }
}

export function newSignIn() {
  try {
    sessionStorage.removeItem(LATER_KEY);
    sessionStorage.removeItem(VIA_PASSKEY_KEY);
  } catch {
    // Nothing to clear.
  }
}

function signedInWithPasskey() {
  try {
    sessionStorage.setItem(VIA_PASSKEY_KEY, "1");
  } catch {
    // Private mode: the offer may show again.
  }
}
