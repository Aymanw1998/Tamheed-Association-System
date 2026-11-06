import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";

jest.mock("react-router-dom", () => {
  const { TextEncoder, TextDecoder } = require("util");
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  return jest.requireActual("react-router");
});
jest.mock("../../WebServer/services/auth/fuctionsAuth", () => ({ getMe: jest.fn(), logout: jest.fn(), requestItPass: jest.fn() }));
jest.mock("../../ALERT/SystemToasts", () => ({ toast: { success: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("../../WebServer/services/vehicle/functionsVehicle", () => ({ getMyPermissions: jest.fn() }));
jest.mock("../../utils/unsavedChanges", () => ({ confirmLeave: () => Promise.resolve(true) }));
jest.mock("../Notice/NoticeBell", () => () => null);
jest.mock("../../tours/NewBadge", () => () => null);
jest.mock("../../pwa/InstallApp", () => ({ InstallAppButton: () => <button type="button" data-testid="install-app">install</button> }));
let mockPerms = [];
jest.mock("../../utils/session", () => ({
  ...jest.requireActual("../../utils/session"),
  canStored: (k) => mockPerms.includes(k),
  getStoredPermissions: () => mockPerms,
}));

import { getMe, logout, requestItPass } from "../../WebServer/services/auth/fuctionsAuth";
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
const navText = () => [...host.querySelectorAll("#main-nav a")].map((el) => el.textContent.trim());
const accountButton = () => host.querySelector('[data-testid="account-button"]');
const accountMenu = () => host.querySelector('[data-testid="account-menu"]');
const item = (label) => [...(accountMenu()?.querySelectorAll("a, button") || [])].find((el) => el.textContent.trim() === label);

beforeEach(() => {
  mockPerms = ["students.view", "users.view", "attendance.view", "lessons.view", "reports.create", "files.use"];
  window.innerWidth = 1280;
  getMe.mockResolvedValue({ firstname: "أيمن", lastname: "و", roles: ["ادارة"] });
  getMyPermissions.mockResolvedValue({ ok: true, permissions: [] });
  logout.mockResolvedValue();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

test("the menu has the pages only: no dashboard, profile, install or sign-out", async () => {
  await mount();
  expect(navText()).toEqual(["البرنامج", "المهمات الأسبوعية", "الطلاب", "طاقم الجمعية", "التقارير", "الملفات"]);
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


// Owner, 2026-11-03: taking a section away (e.g. reports from a guide) takes
// its link out of the menu too.
test("each page link follows its permission", async () => {
  mockPerms = ["students.view", "lessons.view"];
  await mount();
  expect(navText()).toEqual(["البرنامج", "المهمات الأسبوعية", "الطلاب"]);
});

const groupButton = (name) => [...host.querySelectorAll('#main-nav button')].find((button) => button.textContent.includes(name));
test("desktop groups open on click and ArrowDown, close on Escape/outside, and mark the active page", async () => {
  await mount();
  expect(host.querySelector('#main-nav a').textContent).toBe("البرنامج");
  expect(host.querySelector('#main-nav a').getAttribute("aria-current")).toBe("page");
  const people = groupButton("الأعضاء والطاقم");
  await act(async () => people.click());
  expect(people.getAttribute("aria-expanded")).toBe("true");
  await act(async () => host.querySelector('a[href="/students"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(people.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(people);
  await act(async () => people.click());
  await act(async () => document.body.click());
  expect(people.getAttribute("aria-expanded")).toBe("false");
});
test("phone dropdown expands groups, closes after navigation and returns focus to its toggle", async () => {
  window.innerWidth = 375;
  await mount();
  const toggle = host.querySelector('[data-tour="menu-toggle"]');
  toggle.focus();
  await act(async () => toggle.click());
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.body.style.overflow).toBe("hidden");
  await act(async () => groupButton("الأعضاء والطاقم").click());
  await act(async () => host.querySelector('#main-nav a[href="/students"]').click());
  expect(at()).toBe("/students");
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(toggle);
  await act(async () => toggle.click());
  expect(groupButton("الأعضاء والطاقم").getAttribute("aria-expanded")).toBe("true");
  await act(async () => host.querySelector('[role="dialog"]').dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(document.body.style.overflow).not.toBe("hidden");
});
test("phone menu wraps keyboard focus and closes when the account menu is opened", async () => {
  window.innerWidth = 375;
  await mount();
  const toggle = host.querySelector('[data-tour="menu-toggle"]');
  await act(async () => toggle.click());
  const menu = host.querySelector('[role="dialog"]');
  const controls = [...menu.querySelectorAll("a,button")].filter((node) => !node.closest("[hidden]"));
  const first = controls[0], last = controls[controls.length - 1];
  last.focus();
  await act(async () => last.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(first);
  await act(async () => first.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(last);
  await act(async () => accountButton().click());
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(accountMenu()).not.toBeNull();
  expect(document.body.style.overflow).not.toBe("hidden");
});
test("the phone close control restores the menu toggle and page scrolling", async () => {
  window.innerWidth = 375;
  await mount();
  const toggle = host.querySelector('[data-tour="menu-toggle"]');
  await act(async () => toggle.click());
  await act(async () => host.querySelector('[aria-label="إغلاق القائمة"]').click());
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(toggle);
  expect(document.body.style.overflow).not.toBe("hidden");
});
test("groups with no permitted pages are absent", async () => {
  mockPerms = [];
  await mount();
  expect(groupButton("الأعضاء والطاقم")).toBeUndefined();
  expect(groupButton("المتابعة")).toBeUndefined();
  expect(groupButton("الموارد")).toBeUndefined();
  expect(navText()).toEqual(["المهمات الأسبوعية"]);
});

// The system account has no everyday role: its label is «النظام», not an assistant's.
test("the system account's label is «النظام»", async () => {
  getMe.mockResolvedValue({ firstname: "أيمن", lastname: "و", roles: [], isSystem: true });
  await mount();
  expect(accountButton().outerHTML).toContain("النظام");
  expect(accountButton().outerHTML).not.toContain("مساعد مرشد");
});

// Owner, 2026-11-03: «قسم الIT» opens the IT site already signed in, for a user
// who is IT, not blocked, with an everyday role.
const IT_USER = { firstname: "أيمن", lastname: "و", roles: ["ادارة"], role: "ادارة", isIT: true };
const itButton = () => accountMenu()?.querySelector("[data-testid=\"it-site-button\"]") || undefined;
const openMenu = async () => act(async () => accountButton().click());

test("«قسم الIT» is in the name menu for an IT user with an everyday role", async () => {
  getMe.mockResolvedValue(IT_USER);
  await mount();
  await openMenu();
  expect(itButton()).toBeDefined();
});

test.each([
  ["not IT", { ...IT_USER, isIT: false }],
  ["IT but blocked", { ...IT_USER, itBlockedAt: "2026-11-01T10:00:00Z" }],
])("no «قسم الIT» for %s", async (_, user) => {
  getMe.mockResolvedValue(user);
  await mount();
  await openMenu();
  expect(itButton()).toBeUndefined();
});

describe("opening the IT site", () => {
  let tab;
  beforeEach(() => {
    process.env.REACT_APP_IT_URL = "https://it.example.test";
    tab = { location: { href: "" }, close: jest.fn(), opener: {} };
    jest.spyOn(window, "open").mockImplementation(() => tab);
    requestItPass.mockReset();
    getMe.mockResolvedValue(IT_USER);
  });
  afterEach(() => { delete process.env.REACT_APP_IT_URL; jest.restoreAllMocks(); });

  test("the pass is asked for only on click, and a new tab opens with it in the fragment", async () => {
    requestItPass.mockResolvedValue("one-time_pass");
    await mount();
    await openMenu();
    expect(requestItPass).not.toHaveBeenCalled();
    await act(async () => itButton().click());
    expect(requestItPass).toHaveBeenCalledTimes(1);
    // The full address at once (an installed web app can hand it to the IT app).
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(window.open).toHaveBeenCalledWith("https://it.example.test/#pass=one-time_pass", "_blank");
    expect(window.open.mock.calls[0][0]).not.toContain("?");
    expect(tab.opener).toBeNull();
  });

  test("a refused pass (403) opens nothing and takes the button away", async () => {
    requestItPass.mockResolvedValue(null);
    await mount();
    await openMenu();
    await act(async () => itButton().click());
    expect(window.open).not.toHaveBeenCalled();
    await openMenu();
    expect(itButton()).toBeUndefined();
  });
});

test.each([
  ["IT with no everyday role", { ...IT_USER, roles: [], role: undefined }],
  ["the system account", { firstname: "ا", lastname: "ن", isSystem: true }],
])("«قسم الIT» is offered to %s", async (_, user) => {
  getMe.mockResolvedValue(user);
  await mount();
  await openMenu();
  expect(itButton()).toBeDefined();
});
