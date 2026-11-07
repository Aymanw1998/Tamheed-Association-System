import Storage from "./Storage.jsx";
import * as api from "../api";
import * as siteLink from "../siteLink";
import { mount, unmountAll, ok, fail, button, click, toastText } from "../testUtils";

jest.mock("../api", () => ({
  ...jest.requireActual("../api"),
  getDriveStatus: jest.fn(),
  getDriveConnectUrl: jest.fn(),
}));
jest.mock("../siteLink", () => ({ ...jest.requireActual("../siteLink"), goTo: jest.fn() }));

beforeEach(() => window.history.replaceState(null, "", "/storage"));
afterEach(async () => { await unmountAll(); jest.clearAllMocks(); });

test("Storage renders the Drive account", async () => {
  api.getDriveStatus.mockImplementation(() => ok({ connected: true, email: "files@example.org", canConnect: true }));
  const c = await mount(<Storage />);
  expect(c.textContent).toContain("Google Drive");
  expect(c.textContent).toContain("files@example.org");
  expect(c.textContent).toContain("مرتبط");
  expect(button(c, "تغيير الحساب")).toBeDefined();
});

test("Storage: not connected, and «ربط الحساب» goes to Google's consent page", async () => {
  api.getDriveStatus.mockImplementation(() => ok({ connected: false, canConnect: true }));
  api.getDriveConnectUrl.mockImplementation(() => ok({ url: "https://accounts.example.org/consent" }));
  const c = await mount(<Storage />);
  expect(c.textContent).toContain("غير مرتبط");
  await click(button(c, "ربط الحساب"));
  expect(siteLink.goTo).toHaveBeenCalledWith("https://accounts.example.org/consent");
});

test("Storage: without canConnect there is no button", async () => {
  api.getDriveStatus.mockImplementation(() => ok({ connected: true, email: "files@example.org", canConnect: false }));
  const c = await mount(<Storage />);
  expect(c.textContent).toContain("files@example.org");
  expect(button(c, "تغيير الحساب")).toBeUndefined();
});

test("Storage: Google's answer in the address is reported once and removed", async () => {
  window.history.replaceState(null, "", "/storage?drive=connected");
  api.getDriveStatus.mockImplementation(() => ok({ connected: true, email: "files@example.org", canConnect: true }));
  const c = await mount(<Storage />);
  expect(toastText()).toContain("تم ربط حساب Google Drive");
  expect(window.location.search).toBe("");
});

test("Storage: a failed status call", async () => {
  api.getDriveStatus.mockImplementation(() => fail(500, {}));
  const c = await mount(<Storage />);
  expect(c.querySelector("[role=alert]")).not.toBeNull();
});

test("manual Drive discovery is opt-in and describes the account-wide Google permission", async () => {
  api.getDriveStatus.mockImplementation(() => ok({ connected: true, email: "files@example.org", canConnect: true, manualFilesAccess: false }));
  api.getDriveConnectUrl.mockImplementation(() => ok({ url: "https://accounts.example.org/consent" }));
  const c = await mount(<Storage />);
  const checkbox = c.querySelector('input[type="checkbox"]');
  expect(checkbox.checked).toBe(false);
  expect(c.textContent).toContain("قراءة وإدارة ملفات الحساب");
  expect(c.textContent).toContain("Tamheed-System");
  expect(c.textContent).toContain("Storages");
  await click(checkbox);
  await click(button(c, "تغيير الحساب"));
  expect(api.getDriveConnectUrl).not.toHaveBeenCalled();
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog.textContent).toContain("اختر حساب الجمعية نفسه");
  await click(button(dialog, "تأكيد"));
  expect(api.getDriveConnectUrl).toHaveBeenCalledWith({ fullAccess: true });
  expect(siteLink.goTo).toHaveBeenCalledWith("https://accounts.example.org/consent");
});
