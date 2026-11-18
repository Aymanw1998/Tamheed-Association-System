jest.mock("@simplewebauthn/browser", () => ({
  browserSupportsWebAuthn: () => true,
  startAuthentication: jest.fn(),
  startRegistration: jest.fn(),
}));
jest.mock("../WebServer/services/api", () => ({ __esModule: true, default: { post: jest.fn() } }));

import { shouldOfferPasskey, syncSavedPasskey } from "./passkey";

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

test("an account the server says has a passkey is not offered again after a sign-out cleared the device", () => {
  expect(shouldOfferPasskey("111")).toBe(true);
  syncSavedPasskey("111", true);
  expect(shouldOfferPasskey("111")).toBe(false);
});

test("an account whose passkeys were removed is offered again", () => {
  syncSavedPasskey("111", true);
  syncSavedPasskey("111", false);
  expect(shouldOfferPasskey("111")).toBe(true);
});

test("an answer without the flag, or without an account, changes nothing", () => {
  syncSavedPasskey("111", true);
  syncSavedPasskey("111", undefined);
  syncSavedPasskey("", false);
  expect(shouldOfferPasskey("111")).toBe(false);
  expect(shouldOfferPasskey("222")).toBe(true);
});
