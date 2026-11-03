import React, { act } from "react";
import { createRoot } from "react-dom/client";

jest.mock("../../WebServer/services/storage/functionsStorage", () => ({ getDriveConnectUrl: jest.fn(), getDriveStatus: jest.fn() }));
jest.mock("../../ALERT/SystemToasts.jsx", () => ({ toast: { success: jest.fn(), warn: jest.fn() } }));

import { getDriveStatus } from "../../WebServer/services/storage/functionsStorage";
import DriveConnection from "./DriveConnection";
import { I18nProvider } from "../../i18n/I18nContext";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Owner, 2026-11-03: the linked account and «تغيير الحساب» are the system
// account's, and it may give them to anyone (storage.drive).
let host, root;
const mount = async (permissions) => {
  localStorage.setItem("permissions", JSON.stringify(permissions));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<I18nProvider><DriveConnection /></I18nProvider>));
};
beforeEach(() => getDriveStatus.mockResolvedValue({ connected: true, email: "org@example.org", canConnect: true }));
afterEach(async () => { await act(async () => root.unmount()); host.remove(); localStorage.clear(); });

test("an administrator without storage.drive sees no account card", async () => {
  await mount(["files.use", "files.manageAll"]);
  expect(host.textContent).toBe("");
  expect(getDriveStatus).not.toHaveBeenCalled();
});

test("storage.drive shows the linked account and «تغيير الحساب»", async () => {
  await mount(["files.use", "storage.drive"]);
  expect(host.textContent).toContain("org@example.org");
  expect([...host.querySelectorAll("button")].some((b) => b.textContent.includes("تغيير الحساب"))).toBe(true);
});

test("the card stays hidden when the server says this user may not connect", async () => {
  getDriveStatus.mockResolvedValue({ connected: true, email: "org@example.org", canConnect: false });
  await mount(["storage.drive"]);
  expect(host.textContent).toBe("");
});
