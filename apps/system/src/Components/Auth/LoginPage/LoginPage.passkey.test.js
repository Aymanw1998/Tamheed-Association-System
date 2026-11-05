import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";

jest.mock("react-router-dom", () => {
  const { TextEncoder, TextDecoder } = require("util");
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  return jest.requireActual("react-router");
});
jest.mock("../../../WebServer/services/auth/fuctionsAuth", () => ({
  login: jest.fn(), loginWithPass: jest.fn(), loginWithCode: jest.fn(), loginWithPasskey: jest.fn(),
}));
let mockSupported = true;
jest.mock("../../../utils/passkey", () => ({ passkeySupported: () => mockSupported, newSignIn: () => {} }));
jest.mock("../../../ALERT/SystemToasts", () => ({ toast: { success: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../ForgotPassword/ForgotPassword", () => () => null);
jest.mock("../ForcedPasswordChange/ForcedPasswordChange", () => () => null);
jest.mock("../../../pwa/InstallApp", () => ({ InstallAppButton: () => null }));

import { loginWithPasskey } from "../../../WebServer/services/auth/fuctionsAuth";
import { toast } from "../../../ALERT/SystemToasts";
import LoginPage from "./LoginPage";
import { I18nProvider } from "../../../i18n/I18nContext";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root;
const mount = async () => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(
    <I18nProvider><MemoryRouter initialEntries={["/"]}><Routes>
      <Route path="/" element={<LoginPage />} />
      <Route path="/dashboard" element={<p data-testid="dashboard" />} />
    </Routes></MemoryRouter></I18nProvider>
  ));
};
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  mockSupported = true;
  jest.clearAllMocks();
});
const passkeyButton = () => [...host.querySelectorAll("button")].find((b) => b.textContent.includes("البصمة"));

test("the sign-in page offers a fingerprint or face", async () => {
  await mount();
  expect(passkeyButton()).toBeDefined();
});

test("no button where the browser has no passkeys", async () => {
  mockSupported = false;
  await mount();
  expect(passkeyButton()).toBeUndefined();
});

test("a passkey signs in", async () => {
  loginWithPasskey.mockResolvedValue({ ok: true, user: { firstname: "أ" } });
  await mount();
  await act(async () => passkeyButton().click());
  expect(host.querySelector('[data-testid="dashboard"]')).not.toBeNull();
});

test("closing the device's prompt shows no error", async () => {
  loginWithPasskey.mockResolvedValue({ ok: false, cancelled: true });
  await mount();
  await act(async () => passkeyButton().click());
  expect(toast.error).not.toHaveBeenCalled();
});

test("a failure shows the server's message and stays on the page", async () => {
  loginWithPasskey.mockResolvedValue({ ok: false, message: "تعذّر الدخول" });
  await mount();
  await act(async () => passkeyButton().click());
  expect(toast.error).toHaveBeenCalledWith("تعذّر الدخول");
  expect(host.querySelector('[data-testid="dashboard"]')).toBeNull();
});

test("a passkey answered with a required password change says so instead of doing nothing", async () => {
  loginWithPasskey.mockResolvedValue({ ok: true, mustChangePassword: true, accessToken: "t" });
  await mount();
  await act(async () => passkeyButton().click());
  expect(toast.warn).toHaveBeenCalled();
  expect(host.querySelector('[data-testid="dashboard"]')).toBeNull();
});
