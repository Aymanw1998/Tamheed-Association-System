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
  const signedIn = await post("/auth/passkey/login", { response });
  if (signedIn.ok) signedInWithPasskey();
  return signedIn;
}

export async function savePasskey(account) {
  const opts = await post("/auth/passkey/register-options", {});
  if (!opts.ok) return opts;
  let response;
  try {
    response = await startRegistration({ optionsJSON: opts.data.options });
  } catch (err) {
    return cancelled(err) ? { ok: false, cancelled: true } : { ok: false, message: "" };
  }
  const saved = await post("/auth/passkey/register", { response });
  if (saved.ok) rememberSaved(account);
  return saved;
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
