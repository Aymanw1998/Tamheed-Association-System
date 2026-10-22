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
jest.mock("./DriveConnection", () => () => null);
jest.mock("../../ALERT/SystemToasts.jsx", () => ({ toast: { success: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }));

global.IS_REACT_ACT_ENVIRONMENT = true;

let container;
let root;

// CRA resets mock implementations before each test.
beforeEach(async () => {
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
