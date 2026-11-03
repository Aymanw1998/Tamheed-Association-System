import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

jest.mock("react-router-dom", () => {
  const { TextEncoder, TextDecoder } = require("util");
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  return jest.requireActual("react-router");
});
jest.mock("../../WebServer/services/api", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() }, API_BASE_URL: "/api" }));
jest.mock("../../WebServer/services/user/functionsUser.jsx", () => ({
  getAll: jest.fn(), changeStatus: jest.fn(), deleteU: jest.fn(),
}));
jest.mock("../../locks/useLiveRefresh", () => ({ __esModule: true, default: () => {} }));
jest.mock("../ExportPDF/ExportPDF.jsx", () => ({ exportUserPdf: jest.fn() }));
jest.mock("../../ALERT/SystemToasts.jsx", () => ({ toast: { success() {}, warn() {}, error() {}, info() {} } }));
let mockPerms = [];
jest.mock("../../utils/session", () => ({
  ...jest.requireActual("../../utils/session"),
  canStored: (k) => mockPerms.includes(k),
  getStoredViewer: () => ({ id: "admin-1", tz: "900000001", role: "ادارة", isSystem: false }),
}));

import { getAll } from "../../WebServer/services/user/functionsUser.jsx";
import ViewAllUser from "./ViewAllUser";
import { I18nProvider } from "../../i18n/I18nContext";

global.IS_REACT_ACT_ENVIRONMENT = true;
global.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };

// Owner, 2026-11-02: a row opens the user's page, where print, edit,
// suspend and delete are, and approve/activate for a waiting or suspended
// account; the list offers none of them.
const GUIDE = { _id: "g1", tz: "900000002", firstname: "سامي", lastname: "علي", roles: ["مرشد"], room: "active", lockedAt: "2026-11-01T10:00:00Z" };

let container, root;
const mount = async () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<I18nProvider><MemoryRouter initialEntries={["/users"]}><Routes>
    <Route path="/users" element={<ViewAllUser />} />
    <Route path="/users/:id" element={<p data-testid="opened">opened</p>} />
  </Routes></MemoryRouter></I18nProvider>));
};
beforeEach(() => {
  mockPerms = ["users.view", "users.edit", "users.delete", "users.unlock", "users.create"];
  getAll.mockResolvedValue({ ok: true, users: [GUIDE] });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

const rowButtons = () => [...container.querySelectorAll("tbody button")].map((b) => b.textContent.trim());

test("an active user's row offers no «تعديل», file or unlock", async () => {
  await mount();
  expect(container.textContent).toContain("سامي");
  expect(rowButtons()).toEqual([]);
});

// Owner, 2026-11-03: restoring the system account is an IT action.
test("the list has no system-account recovery button, even with systemRecovery.reset", async () => {
  mockPerms = [...mockPerms, "systemRecovery.reset"];
  await mount();
  expect(container.textContent).not.toContain("استعادة حساب النظام");
  expect(container.querySelector('[data-tour="users-recover"]')).toBeNull();
});

test("clicking anywhere on the row opens the user's page", async () => {
  await mount();
  const row = [...container.querySelectorAll("tbody tr")].find((tr) => tr.textContent.includes("900000002"));
  await act(async () => row.querySelector("td").click());
  expect(container.querySelector('[data-testid="opened"]')).not.toBeNull();
});

test("a waiting or suspended account has no buttons in the list; its row opens the page", async () => {
  for (const [room, filter] of [["waiting", /بانتظار|ينتظر/], ["noActive", /موقوف/]]) {
    getAll.mockResolvedValue({ ok: true, users: [{ ...GUIDE, room, lockedAt: null }] });
    await mount();
    // The status sits in the «فلتر» window.
    const open = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "فلتر");
    await act(async () => open.click());
    const tab = [...container.querySelectorAll("button")].find((b) => filter.test(b.textContent));
    await act(async () => tab.click());
    const close = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "إغلاق");
    await act(async () => close.click());
    expect([room, rowButtons()]).toEqual([room, []]);
    const row = [...container.querySelectorAll("tbody tr")].find((tr) => tr.textContent.includes("900000002"));
    await act(async () => row.querySelector("td").click());
    expect([room, container.querySelector('[data-testid="opened"]') !== null]).toEqual([room, true]);
    act(() => root.unmount());
    container.remove();
  }
  await mount();
});

test("each row shows the person's photo", async () => {
  getAll.mockResolvedValue({ ok: true, users: [{ ...GUIDE, photo: "https://example.test/g1.jpg" }] });
  await mount();
  const imgs = [...container.querySelectorAll('tbody img[loading="lazy"]')];
  expect(imgs.map((i) => i.getAttribute("src"))).toEqual(["https://example.test/g1.jpg"]);
  expect(container.querySelectorAll('ul img[loading="lazy"]').length).toBe(1);
});
