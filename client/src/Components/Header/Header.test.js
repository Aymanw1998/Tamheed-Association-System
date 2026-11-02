import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";

jest.mock("react-router-dom", () => {
  const { TextEncoder, TextDecoder } = require("util");
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  return jest.requireActual("react-router");
});
jest.mock("../../WebServer/services/auth/fuctionsAuth", () => ({ getMe: jest.fn(), logout: jest.fn() }));
jest.mock("../../WebServer/services/vehicle/functionsVehicle", () => ({ getMyPermissions: jest.fn() }));
jest.mock("../../utils/unsavedChanges", () => ({ confirmLeave: () => Promise.resolve(true) }));
jest.mock("../Notice/NoticeBell", () => () => null);
jest.mock("../../tours/NewBadge", () => () => null);
jest.mock("../../pwa/InstallApp", () => ({ InstallAppButton: () => <button type="button" data-testid="install-app">install</button> }));
let mockPerms = [];
jest.mock("../../utils/session", () => ({
  ...jest.requireActual("../../utils/session"),
  canStored: (k) => mockPerms.includes(k),
}));

import { getMe, logout } from "../../WebServer/services/auth/fuctionsAuth";
import { getMyPermissions } from "../../WebServer/services/vehicle/functionsVehicle";
import Header from "./Header";
import { I18nProvider } from "../../i18n/I18nContext";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Owner, 2026-11-02: the menu holds the pages only. The dashboard is the
// logo; profile, installing the app and signing out are in a small menu
// under the user's name.
let host, root;
const mount = async () => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<I18nProvider><MemoryRouter initialEntries={["/lessons"]}><Routes>
    <Route path="*" element={<><Header /><Probe /></>} />
  </Routes></MemoryRouter></I18nProvider>));
};
const { useLocation } = jest.requireActual("react-router");
function Probe() {
  return <p data-testid="at">{useLocation().pathname}</p>;
}
const at = () => host.querySelector('[data-testid="at"]').textContent;
const navText = () => [...host.querySelectorAll("#main-nav a, #main-nav button")].map((el) => el.textContent.trim());
const accountButton = () => host.querySelector('[data-testid="account-button"]');
const accountMenu = () => host.querySelector('[data-testid="account-menu"]');
const item = (label) => [...(accountMenu()?.querySelectorAll("a, button") || [])].find((el) => el.textContent.trim() === label);

beforeEach(() => {
  mockPerms = ["students.view", "users.view"];
  window.innerWidth = 1280;
  getMe.mockResolvedValue({ firstname: "أيمن", lastname: "و", roles: ["ادارة"] });
  getMyPermissions.mockResolvedValue({ ok: true, permissions: [] });
  logout.mockResolvedValue();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

test("the menu has the pages only: no dashboard, profile, install or sign-out", async () => {
  await mount();
  expect(navText()).toEqual(["الحضور والغياب", "المستخدمون", "الطلاب", "الدروس", "التقارير", "الملفات"]);
});

test("the logo opens the dashboard", async () => {
  await mount();
  const logo = host.querySelector('a[href="/dashboard"] img')?.closest("a");
  expect(logo).toBeTruthy();
  await act(async () => logo.click());
  expect(at()).toBe("/dashboard");
});

test("the user's name opens a menu with profile, install and sign-out", async () => {
  await mount();
  expect(accountButton().textContent).toContain("أيمن");
  expect(accountMenu()).toBeNull();
  await act(async () => accountButton().click());
  expect(accountButton().getAttribute("aria-expanded")).toBe("true");
  expect(item("الملف الشخصي")).toBeDefined();
  expect(accountMenu().querySelector('[data-testid="install-app"]')).not.toBeNull();
  expect(item("تسجيل الخروج")).toBeDefined();
});

test("profile in the name menu opens the profile and closes the menu", async () => {
  await mount();
  await act(async () => accountButton().click());
  await act(async () => item("الملف الشخصي").click());
  expect(at()).toBe("/profile");
  expect(accountMenu()).toBeNull();
});

test("sign-out in the name menu signs out", async () => {
  await mount();
  await act(async () => accountButton().click());
  await act(async () => item("تسجيل الخروج").click());
  expect(logout).toHaveBeenCalled();
});

test("Escape and a click outside close the name menu", async () => {
  await mount();
  await act(async () => accountButton().click());
  await act(async () => accountMenu().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(accountMenu()).toBeNull();
  await act(async () => accountButton().click());
  await act(async () => document.body.click());
  expect(accountMenu()).toBeNull();
});

test("sign-out is reachable before the user's details load", async () => {
  getMe.mockReturnValue(new Promise(() => {}));
  await mount();
  await act(async () => accountButton().click());
  expect(item("تسجيل الخروج")).toBeDefined();
});
