import React, { act } from "react";
import { createRoot } from "react-dom/client";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }));
jest.mock("../../WebServer/services/notice/functionsNotice.jsx", () => ({ getNotices: jest.fn(), getUnreadCount: jest.fn(), markNoticeRead: jest.fn() }));
jest.mock("../../WebServer/services/alerts/functionsAlerts.jsx", () => ({ listAlerts: jest.fn(), countUnreadAlerts: jest.fn(), markAlertRead: jest.fn() }));
jest.mock("../../WebServer/services/live/liveStream", () => ({ liveEvents: { on: () => () => {} } }));
jest.mock("../../WebServer/services/traffic", () => ({ clearTraffic: jest.fn() }));
jest.mock("../../i18n/I18nContext", () => ({ useI18n: () => ({ t: (key) => key }) }));

import { getNotices, getUnreadCount, markNoticeRead } from "../../WebServer/services/notice/functionsNotice.jsx";
import { countUnreadAlerts, listAlerts, markAlertRead } from "../../WebServer/services/alerts/functionsAlerts.jsx";
import NoticeBell from "./NoticeBell";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const alert = (id, at, read = false, link = "/users") => ({ id, type: "user_waiting", severity: "info", text: { ar: `alert ${id}` }, link, at, read });
const notice = (id, createdAt, read = false) => ({ _id: id, title: `notice ${id}`, createdAt, read });

let host, root;
const mount = async (props = {}) => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<NoticeBell {...props} />));
};
const bell = () => host.querySelector("button[aria-haspopup]");
const press = async () => act(async () => bell().click());
const rows = () => [...host.querySelectorAll('[role="dialog"] button')].map((b) => b.textContent);

const setLists = (alerts, notices = []) => {
  listAlerts.mockImplementation(async ({ unread } = {}) => (unread ? alerts.filter((a) => !a.read) : alerts));
  getNotices.mockImplementation(async ({ status }) => ({ ok: true, notices: status === "unread" ? notices.filter((n) => !n.read) : notices }));
};

beforeEach(() => {
  mockNavigate.mockReset();
  countUnreadAlerts.mockResolvedValue(0);
  getUnreadCount.mockResolvedValue({ ok: true, count: 0 });
  markAlertRead.mockResolvedValue();
  markNoticeRead.mockResolvedValue({ ok: true });
  setLists([]);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

test("a press opens the window and does not leave the page; the lists load only then", async () => {
  countUnreadAlerts.mockResolvedValue(1);
  setLists([alert("1", "2026-11-05T10:00:00Z")]);
  await mount();
  expect(listAlerts).not.toHaveBeenCalled();
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  await press();
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();
  expect(rows()[0]).toContain("alert 1");
  expect(mockNavigate).not.toHaveBeenCalled();
});

test("the badge is the server's count, even when the unread one is past the capped list", async () => {
  countUnreadAlerts.mockResolvedValue(2);
  getUnreadCount.mockResolvedValue({ ok: true, count: 1 });
  const readOnes = Array.from({ length: 200 }, (_, i) => notice(`r${i}`, "2026-11-05T10:00:00Z", true));
  setLists([], [...readOnes]);
  getNotices.mockImplementation(async ({ status }) => ({ ok: true, notices: status === "unread" ? [notice("old", "2020-01-01T10:00:00Z")] : readOnes }));
  await mount({ canViewNotices: true });
  expect(bell().textContent).toContain("3");
  await press();
  expect(rows()[0]).toContain("notice old");
});

test("the window shows at most three, unread first, then the board button", async () => {
  setLists(
    [alert("1", "2026-11-01T10:00:00Z"), alert("2", "2026-11-04T10:00:00Z"), alert("3", "2026-11-05T10:00:00Z", true)],
    [notice("n1", "2026-11-03T10:00:00Z"), notice("n2", "2026-11-05T12:00:00Z", true)],
  );
  await mount({ canViewNotices: true });
  await press();
  const texts = rows();
  expect(texts[0]).toContain("alert 2");
  expect(texts[1]).toContain("notice n1");
  expect(texts[2]).toContain("alert 1");
  expect(texts).toHaveLength(4);
  expect(texts[3]).toBe("notices.bellBoard");
});

test("the board button goes to the board, and is missing without the permission", async () => {
  await mount({ canViewNotices: false });
  await press();
  expect(rows()).toEqual([]);
  expect(getNotices).not.toHaveBeenCalled();
  expect(getUnreadCount).not.toHaveBeenCalled();
  await act(async () => root.unmount());
  host.remove();
  await mount({ canViewNotices: true });
  await press();
  await act(async () => host.querySelector('[role="dialog"] button').click());
  expect(mockNavigate).toHaveBeenCalledWith("/notices");
});

test("opening a message marks it read and follows its link", async () => {
  countUnreadAlerts.mockResolvedValue(1);
  setLists([alert("1", "2026-11-05T10:00:00Z")]);
  await mount();
  await press();
  countUnreadAlerts.mockResolvedValue(0);
  await act(async () => host.querySelector('[role="dialog"] button').click());
  expect(markAlertRead).toHaveBeenCalledWith("1");
  expect(markNoticeRead).not.toHaveBeenCalled();
  expect(mockNavigate).toHaveBeenCalledWith("/users");
  expect(bell().textContent).not.toMatch(/\d/);
});

test("a count that left before a read cannot bring the badge back", async () => {
  countUnreadAlerts.mockResolvedValue(1);
  setLists([alert("1", "2026-11-05T10:00:00Z")]);
  await mount();
  await press();
  let finishOld;
  countUnreadAlerts.mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }));
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  countUnreadAlerts.mockResolvedValue(0);
  await act(async () => host.querySelector('[role="dialog"] button').click());
  await act(async () => finishOld(1));
  expect(bell().textContent).not.toMatch(/\d/);
});

test("a failed alert read does not lose the notices", async () => {
  listAlerts.mockRejectedValue(new Error("down"));
  countUnreadAlerts.mockRejectedValue(new Error("down"));
  getUnreadCount.mockResolvedValue({ ok: true, count: 1 });
  getNotices.mockResolvedValue({ ok: true, notices: [notice("n1", "2026-11-03T10:00:00Z")] });
  await mount({ canViewNotices: true });
  expect(bell().textContent).toContain("1");
  await press();
  expect(rows()[0]).toContain("notice n1");
});
