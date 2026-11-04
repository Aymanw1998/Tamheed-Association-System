import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";

jest.mock("react-router-dom", () => {
  const { TextEncoder, TextDecoder } = require("util");
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  return jest.requireActual("react-router");
});
jest.mock("../../../WebServer/services/auth/fuctionsAuth", () => ({ login: jest.fn(), loginWithPass: jest.fn(), loginWithCode: jest.fn() }));
jest.mock("../../../ALERT/SystemToasts", () => ({ toast: { success: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("../ForgotPassword/ForgotPassword", () => () => null);
const mockChanged = { current: null };
jest.mock("../ForcedPasswordChange/ForcedPasswordChange", () => (props) => { mockChanged.current = props.onChanged; return null; });
jest.mock("../../../pwa/InstallApp", () => ({ InstallAppButton: () => null }));

import { login, loginWithCode } from "../../../WebServer/services/auth/fuctionsAuth";
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
  jest.clearAllMocks();
});
const type = async (name, value) => {
  const input = host.querySelector(`input[name="${name}"]`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const submit = () => act(async () => host.querySelector('button[type="submit"]').click());
const signIn = async () => {
  await mount();
  await type("tz", "100000009");
  await type("password", "secret");
  await submit();
};

test("after the right password an IT user with no role is asked for the code", async () => {
  login.mockResolvedValue({ codeRequired: true, tz: "100000009", ticket: "tk" });
  await signIn();
  expect(host.querySelector('input[name="code"]')).not.toBeNull();
  expect(host.querySelector('[data-testid="dashboard"]')).toBeNull();
});

test("the right code signs in", async () => {
  login.mockResolvedValue({ codeRequired: true, tz: "100000009", ticket: "tk" });
  loginWithCode.mockResolvedValue({ firstname: "أ" });
  await signIn();
  await type("code", "123456");
  await submit();
  expect(loginWithCode).toHaveBeenCalledWith("100000009", "123456", "tk");
  expect(host.querySelector('[data-testid="dashboard"]')).not.toBeNull();
});

test("a wrong code stays on the step and shows the server's message", async () => {
  login.mockResolvedValue({ codeRequired: true, tz: "100000009", ticket: "tk" });
  loginWithCode.mockRejectedValue(Object.assign(new Error("x"), { response: { data: { message: "الرمز غير صحيح" } } }));
  await signIn();
  await type("code", "000000");
  await submit();
  expect(toast.error).toHaveBeenCalledWith("الرمز غير صحيح");
  expect(host.querySelector('input[name="code"]')).not.toBeNull();
});

test("«use a passkey» from the server reaches the user", async () => {
  login.mockRejectedValue(Object.assign(new Error("x"), { response: { data: { code: "USE_PASSKEY", message: "سجّل الدخول بالبصمة" } } }));
  await signIn();
  expect(toast.error).toHaveBeenCalledWith("سجّل الدخول بالبصمة");
  expect(host.querySelector('input[name="code"]')).toBeNull();
});

test("after a forced password change the code step follows", async () => {
  login.mockResolvedValueOnce({ mustChangePassword: true, accessToken: "t" });
  login.mockResolvedValueOnce({ codeRequired: true, tz: "100000009" });
  await signIn();
  await act(async () => mockChanged.current("new-pass"));
  expect(host.querySelector('input[name="code"]')).not.toBeNull();
});
