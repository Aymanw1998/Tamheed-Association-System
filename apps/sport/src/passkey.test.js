import { signInWithPasskey, savePasskey, shouldOfferPasskey, rememberOffer, newSignIn } from "./passkey";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import * as api from "./api.js";

// Passkeys (2026-11-01): a fingerprint or face signs the player in.
jest.mock("@simplewebauthn/browser", () => ({
  browserSupportsWebAuthn: () => true,
  startAuthentication: jest.fn(),
  startRegistration: jest.fn(),
}));
jest.mock("./api.js", () => ({
  passkeyLoginOptions: jest.fn(),
  passkeyLogin: jest.fn(),
  passkeyRegisterOptions: jest.fn(),
  passkeyRegister: jest.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  api.passkeyLoginOptions.mockImplementation(() => Promise.resolve({ ok: true, data: { options: { challenge: "c" } } }));
  api.passkeyLogin.mockImplementation(() => Promise.resolve({ ok: true, data: { ok: true } }));
  api.passkeyRegisterOptions.mockImplementation(() => Promise.resolve({ ok: true, data: { options: { challenge: "r" } } }));
  api.passkeyRegister.mockImplementation(() => Promise.resolve({ ok: true, data: { ok: true } }));
  startAuthentication.mockImplementation(() => Promise.resolve({ id: "cred" }));
  startRegistration.mockImplementation(() => Promise.resolve({ id: "cred" }));
});

test("signing in asks the phone for the passkey and sends its answer", async () => {
  expect(await signInWithPasskey()).toEqual({ ok: true });
  expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: { challenge: "c" } });
  expect(api.passkeyLogin).toHaveBeenCalledWith({ id: "cred" });
});

test("closing the phone's prompt is not an error", async () => {
  startAuthentication.mockImplementation(() => Promise.reject(Object.assign(new Error("x"), { name: "NotAllowedError" })));
  expect(await signInWithPasskey()).toEqual({ ok: false, cancelled: true });
  expect(api.passkeyLogin).not.toHaveBeenCalled();
});

test("a refused passkey gives the server's message", async () => {
  api.passkeyLogin.mockImplementation(() => Promise.resolve({ ok: false, data: { message: "تعذّر الدخول بالبصمة" } }));
  expect(await signInWithPasskey()).toEqual({ ok: false, message: "تعذّر الدخول بالبصمة" });
});

test("saving a passkey registers it and remembers it for this account on this device", async () => {
  expect(shouldOfferPasskey("a")).toBe(true);
  expect(await savePasskey("a")).toEqual({ ok: true });
  expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: "r" } });
  expect(api.passkeyRegister).toHaveBeenCalledWith({ id: "cred" });
  expect(shouldOfferPasskey("a")).toBe(false);
  newSignIn();
  expect(shouldOfferPasskey("a")).toBe(false);
});

test("another account on the same device is still asked", async () => {
  await savePasskey("a");
  expect(shouldOfferPasskey("b")).toBe(true);
});

test("'later' holds until the next sign-in, and only for that account", () => {
  rememberOffer("a");
  expect(shouldOfferPasskey("a")).toBe(false);
  expect(shouldOfferPasskey("b")).toBe(true);
  newSignIn();
  expect(shouldOfferPasskey("a")).toBe(true);
});

test("signing in with a passkey here means this account has one here", async () => {
  newSignIn();
  await signInWithPasskey();
  expect(shouldOfferPasskey("c")).toBe(false);
  newSignIn();
  expect(shouldOfferPasskey("c")).toBe(false);
});

test("with no account known, no offer", () => {
  expect(shouldOfferPasskey("")).toBe(false);
});
