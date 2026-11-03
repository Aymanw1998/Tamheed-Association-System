import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";

jest.mock("react-router-dom", () => {
  const { TextEncoder, TextDecoder } = require("util");
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  return jest.requireActual("react-router");
});
jest.mock("../../../WebServer/services/auth/fuctionsAuth", () => ({ login: jest.fn(), loginWithPass: jest.fn() }));
jest.mock("../../../ALERT/SystemToasts", () => ({ toast: { success: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("../ForgotPassword/ForgotPassword", () => () => null);
jest.mock("../ForcedPasswordChange/ForcedPasswordChange", () => () => null);
jest.mock("../../../pwa/InstallApp", () => ({ InstallAppButton: () => null }));

import { login, loginWithPass } from "../../../WebServer/services/auth/fuctionsAuth";
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
  window.history.replaceState(null, "", "/");
  jest.clearAllMocks();
});

// Owner, 2026-11-03: «قسم الIT» on the IT site opens the everyday app already
// signed in. The pass is in the fragment, removed from the address at once.
test("a pass in the address signs in without the password and is removed from the address", async () => {
  window.history.replaceState(null, "", "/#pass=abc_DEF-123");
  loginWithPass.mockResolvedValue({ firstname: "أيمن", lastname: "و" });
  await mount();
  expect(window.location.hash).toBe("");
  expect(window.location.href).not.toContain("abc_DEF-123");
  expect(loginWithPass).toHaveBeenCalledTimes(1);
  expect(loginWithPass).toHaveBeenCalledWith("abc_DEF-123");
  expect(login).not.toHaveBeenCalled();
  expect(host.querySelector('[data-testid="dashboard"]')).not.toBeNull();
});

test("a spent or expired pass shows the server's message and leaves the sign-in form", async () => {
  window.history.replaceState(null, "", "/#pass=old");
  loginWithPass.mockRejectedValue(Object.assign(new Error("x"), { response: { data: { message: "انتهت صلاحية الانتقال، سجّل الدخول من جديد" } } }));
  await mount();
  expect(toast.error).toHaveBeenCalledWith("انتهت صلاحية الانتقال، سجّل الدخول من جديد");
  expect(host.querySelector('input[name="tz"]')).not.toBeNull();
  expect(host.querySelector('[data-testid="dashboard"]')).toBeNull();
});

test("no pass in the address means the usual form and no pass call", async () => {
  await mount();
  expect(loginWithPass).not.toHaveBeenCalled();
  expect(host.querySelector('input[name="tz"]')).not.toBeNull();
});
