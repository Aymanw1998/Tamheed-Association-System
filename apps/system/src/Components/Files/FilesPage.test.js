import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

import FilesPage from "./FilesPage";
import { I18nProvider } from "../../i18n/I18nContext";
import { startDemo, stopDemo } from "../../journey/demoMode";
import { DEMO_UPLOAD_NAME } from "../../journey/demoData";
import * as Storage from "../../WebServer/services/storage/functionsStorage";

jest.mock("../../WebServer/services/storage/functionsStorage", () => ({
  cancelStorageUpload: jest.fn(),
  createStorageFolder: jest.fn(),
  deleteStorageFile: jest.fn(),
  downloadSharedStorageFile: jest.fn(),
  downloadStorageFile: jest.fn(),
  getStorageEntries: jest.fn(),
  getStorageShareStatus: jest.fn(),
  getStorageShareLinkInfo: jest.fn(),
  getStorageSharedEntries: jest.fn(),
  getStorageStats: jest.fn(),
  openSharedStorageFile: jest.fn(),
  openStorageFile: jest.fn(),
  renameStorageFile: jest.fn(),
  shareStorageEntry: jest.fn(),
  unshareStorageEntry: jest.fn(),
  uploadStorageFileAuto: jest.fn(),
}));
jest.mock("../../WebServer/services/live/liveStream", () => ({ openLiveStream: () => () => {} }));
jest.mock("../../WebServer/services/user/functionsUser", () => ({ getAll: jest.fn() }));
jest.mock("../../ALERT/SystemToasts.jsx", () => ({ toast: { success: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));

global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

test("revoked file write permissions remove upload, folder, rename, delete and share controls", async () => {
  localStorage.setItem("permissions", JSON.stringify(["files.use"]));
  Storage.getStorageEntries.mockResolvedValue({ items: [{ name: "record.txt", path: "Storages/record.txt", type: "file" }] });
  await act(async () => root.unmount());
  root = createRoot(container);
  await act(async () => root.render(<I18nProvider><FilesPage /></I18nProvider>));
  for (const action of ["files-upload", "files-new-folder", "files-share", "files-delete"]) {
    expect(container.querySelector(`[data-tour="${action}"]`)).toBeNull();
  }
  expect([...container.querySelectorAll("button")].some((b) => b.textContent.trim() === "إعادة تسمية")).toBe(false);
});

// CRA resets mock implementations before each test.
beforeEach(async () => {
  localStorage.setItem("permissions", JSON.stringify(["files.use", "files.upload", "files.createFolder", "files.rename", "files.delete", "files.share"]));
  Storage.getStorageEntries.mockResolvedValue({ items: [] });
  Storage.getStorageStats.mockResolvedValue(null);
  Storage.uploadStorageFileAuto.mockResolvedValue({ ok: true });
  Storage.createStorageFolder.mockResolvedValue({ ok: true });
  jest.spyOn(console, "info").mockImplementation(() => {});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<I18nProvider><FilesPage /></I18nProvider>);
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  stopDemo();
  jest.restoreAllMocks();
});

const byTour = (name) => container.querySelector(`[data-tour="${name}"]`);

test("in training mode the upload button uploads the demo file and never reaches the file picker", async () => {
  startDemo();
  const input = byTour("files-upload").querySelector('input[type="file"]');
  const reached = jest.fn();
  input.addEventListener("click", reached);

  await act(async () => {
    byTour("files-upload").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  expect(reached).not.toHaveBeenCalled();
  expect(Storage.uploadStorageFileAuto).toHaveBeenCalledTimes(1);
  const [file, path] = Storage.uploadStorageFileAuto.mock.calls[0];
  expect(file.name).toBe(DEMO_UPLOAD_NAME);
  expect(path).toBe("");
});

test("outside training mode the upload button still opens the file picker", async () => {
  const input = byTour("files-upload").querySelector('input[type="file"]');
  const reached = jest.fn((event) => event.preventDefault());
  input.addEventListener("click", reached);

  await act(async () => {
    byTour("files-upload").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });

  expect(reached).toHaveBeenCalled();
  expect(Storage.uploadStorageFileAuto).not.toHaveBeenCalled();
});

test("a new folder is named in an in-page window (no browser prompt)", async () => {
  const prompt = jest.spyOn(window, "prompt").mockImplementation(() => null);
  await act(async () => byTour("files-new-folder").click());
  expect(byTour("files-folder-dialog")).not.toBeNull();
  expect(byTour("files-folder-create").disabled).toBe(true);

  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setter.call(byTour("files-folder-name"), "أنشطة الصيف");
    byTour("files-folder-name").dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => byTour("files-folder-create").click());

  expect(prompt).not.toHaveBeenCalled();
  expect(Storage.createStorageFolder).toHaveBeenCalledWith({ path: "", name: "أنشطة الصيف" });
  expect(byTour("files-folder-dialog")).toBeNull();
});

// Owner, 2026-11-03: the storage space sits in a window opened by
// «معلومات التخزين», like the filters.
test("the storage space shows only in the «معلومات التخزين» window", async () => {
  Storage.getStorageStats.mockResolvedValue({ displayTotalBytes: 1024, displayAvailableBytes: 1024, displayUsedBytes: 0 });
  await act(async () => root.unmount());
  root = createRoot(container);
  await act(async () => {
    root.render(<I18nProvider><FilesPage /></I18nProvider>);
  });
  expect(container.textContent).not.toContain("إجمالي المساحة");
  const open = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "معلومات التخزين");
  expect(open).toBeTruthy();
  await act(async () => open.click());
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog.querySelector("h3").textContent).toBe("معلومات التخزين");
  expect(dialog.textContent).toContain("إجمالي المساحة");
});

// Owner, 2026-11-03: connecting the Google Drive account is an IT action, on
// the IT site. The window keeps only the storage space.
test("the storage window has no Drive card, even for a holder of storage.drive", async () => {
  localStorage.setItem("permissions", JSON.stringify(["files.use", "storage.drive"]));
  try {
    const openButton = () => [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "معلومات التخزين");
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => {
      root.render(<I18nProvider><FilesPage /></I18nProvider>);
    });
    // No storage numbers: nothing to open.
    expect(openButton()).toBeUndefined();
    Storage.getStorageStats.mockResolvedValue({ displayTotalBytes: 1024, displayAvailableBytes: 1024, displayUsedBytes: 0 });
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => {
      root.render(<I18nProvider><FilesPage /></I18nProvider>);
    });
    await act(async () => openButton().click());
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog.textContent).toContain("إجمالي المساحة");
    expect(dialog.textContent).not.toMatch(/Google|Drive|درايف|جوجل|غوغل/i);
  } finally {
    localStorage.removeItem("permissions");
  }
});
