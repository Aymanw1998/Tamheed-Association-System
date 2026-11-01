import { signInWithPasskey, savePasskey, shouldOfferPasskey, rememberOffer } from "./passkey";
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

test("saving a passkey registers it and remembers this phone has one", async () => {
  expect(shouldOfferPasskey()).toBe(true);
  expect(await savePasskey()).toEqual({ ok: true });
  expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: "r" } });
  expect(api.passkeyRegister).toHaveBeenCalledWith({ id: "cred" });
  expect(shouldOfferPasskey()).toBe(false);
});

test("'later' stops the offer on this phone", () => {
  rememberOffer();
  expect(shouldOfferPasskey()).toBe(false);
});
