jest.mock("../../utils/session", () => ({ ...jest.requireActual("../../utils/session"), canStored: jest.fn(() => true) }));
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "../../i18n/I18nContext";
import NoticesBoard from "./NoticesBoard";
import { createNotice, getNotices } from "../../WebServer/services/notice/functionsNotice.jsx";
jest.mock("./SystemAlerts.jsx", () => () => null);

jest.mock("react-router-dom", () => {
  const { TextEncoder, TextDecoder } = require("util");
  if (!global.TextEncoder) global.TextEncoder = TextEncoder;
  if (!global.TextDecoder) global.TextDecoder = TextDecoder;
  return jest.requireActual("react-router");
});
// Owner, 2026-11-02: a notice may get an end date when it is posted; the
// board shows it.
jest.mock("../../WebServer/services/notice/functionsNotice.jsx", () => ({
  archiveNotice: jest.fn(), changeNoticeState: jest.fn(), createNotice: jest.fn(), getNotices: jest.fn(),
  markAllNoticesRead: jest.fn(), markNoticeRead: jest.fn(), runVehicleCheck: jest.fn(),
}));
jest.mock("../../ALERT/SystemToasts", () => ({ toast: { success: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let host, root;
beforeEach(() => {
  require("../../utils/session").canStored.mockReturnValue(true);
  getNotices.mockResolvedValue({ ok: true, notices: [
    { _id: "n1", title: "اجتماع", body: "", severity: "info", category: "manual", createdAt: "2026-11-02T08:00:00Z", read: true, endDate: "2026-11-20" },
  ] });
  createNotice.mockResolvedValue({ ok: true, notice: {} });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

const mount = async () => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<MemoryRouter><I18nProvider><NoticesBoard /></I18nProvider></MemoryRouter>));
};

const setValue = (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

test("the end date chosen is sent with the notice", async () => {
  await mount();
  const date = host.querySelector('input[type="date"]');
  expect(date).not.toBeNull();
  await act(async () => {
    setValue(host.querySelector('[data-tour="notices-title"]'), "اجتماع");
    setValue(date, "2026-11-20");
  });
  await act(async () => host.querySelector('[data-tour="notices-submit"]').click());
  expect(createNotice).toHaveBeenCalledWith(expect.objectContaining({ title: "اجتماع", endDate: "2026-11-20" }));
});

test("a notice with an end date shows it", async () => {
  await mount();
  expect(host.textContent).toContain("20/11/2026");
});

// Owner, 2026-11-08: the trash has a permanent delete of its own (notices.purge).
jest.mock("../Provides/confirmBus", () => ({ ask: jest.fn(() => Promise.resolve(true)) }));
const trashed = { _id: "t1", title: "قديم", body: "", severity: "info", category: "manual", createdAt: "2026-11-02T08:00:00Z", read: true, deletedAt: "2026-11-05T08:00:00Z" };
const buttonNamed = (name) => [...host.querySelectorAll("button")].find((b) => b.textContent === name);

test("a trashed notice can be deleted for good only with notices.purge", async () => {
  const { changeNoticeState } = require("../../WebServer/services/notice/functionsNotice.jsx");
  changeNoticeState.mockResolvedValue({ ok: true });
  require("../Provides/confirmBus").ask.mockResolvedValue(true);
  getNotices.mockResolvedValue({ ok: true, notices: [trashed] });
  await mount();
  await act(async () => buttonNamed("حذف نهائي").click());
  expect(require("../Provides/confirmBus").ask).toHaveBeenCalledWith("delete", expect.any(Object));
  expect(changeNoticeState).toHaveBeenCalledWith("t1", "purge");
});

test("without notices.purge the trash has no permanent delete", async () => {
  require("../../utils/session").canStored.mockImplementation((key) => key !== "notices.purge");
  getNotices.mockResolvedValue({ ok: true, notices: [trashed] });
  await mount();
  expect(buttonNamed("حذف نهائي")).toBeUndefined();
  expect(buttonNamed("استعادة الإعلان")).toBeDefined();
});
